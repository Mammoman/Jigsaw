import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { PieceRuntimeState } from "../types/puzzle";
import { BoardConfig, generatePieces } from "../utils/boardGenerator";
import { supabase } from "@/lib/supabase/client";

export type PiecePositions = Record<string, { x: number; y: number }>;

interface PuzzleState {
  puzzleId: string | null;
  username: string | null;
  boardConfig: BoardConfig | null;
  image: HTMLImageElement | null;
  pieces: Record<string, PieceRuntimeState>;
  renderOrder: string[];
  /** True once a peer's board snapshot has been applied; local saves must not override it. */
  remoteSynced: boolean;

  // Settings
  previewVisible: boolean;
  showEdgesOnly: boolean;
  backgroundColor: string;

  camera: { x: number; y: number; scale: number };

  activeDragGroupId: string | null;
  lastDragPos: { x: number; y: number } | null;

  // Multiplayer lobby state
  playerCount: number;

  // Remote Multiplayer State
  remoteCursors: Record<string, { x: number; y: number; color: string; username?: string }>;

  panCamera: (dx: number, dy: number) => void;
  setCamera: (camera: { x: number; y: number; scale: number }) => void;

  startGroupDrag: (groupId: string, clientPos: { x: number; y: number }) => void;
  updateGroupDrag: (clientPos: { x: number; y: number }) => void;
  endGroupDrag: () => void;

  /** Move a whole group so that `anchorId` lands at (x, y). Absolute, so lost messages self-heal. */
  applyRemoteGroupPosition: (anchorId: string, x: number, y: number) => void;
  /** Assign the given pieces to `groupId` at exact positions (used after a peer snaps). */
  applyGroupSnapshot: (groupId: string, positions: PiecePositions) => void;
  /** Replace the whole board with a peer's copy. */
  applyBoardSnapshot: (pieces: Record<string, PieceRuntimeState>, renderOrder: string[]) => void;

  mergeGroups: (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => void;
  setPieces: (pieces: Record<string, PieceRuntimeState>, renderOrder: string[]) => void;
  setBoardConfig: (config: BoardConfig) => void;
  resetBoard: () => void;
  setImage: (image: HTMLImageElement) => void;
  setPuzzleId: (id: string) => void;
  setUsername: (username: string | null) => void;
  setPlayerCount: (count: number) => void;
  loadSavedGame: (puzzleId: string) => Promise<boolean>;
  clearSavedGame: (puzzleId: string) => Promise<void>;

  togglePreview: () => void;
  toggleShowEdgesOnly: () => void;
  setBackgroundColor: (color: string) => void;

  updateRemoteCursor: (id: string, x: number, y: number, color: string, username?: string) => void;
  removeRemoteCursor: (id: string) => void;
}

function bumpToTop(renderOrder: string[], ids: string[]) {
  const set = new Set(ids);
  return renderOrder.filter((id) => !set.has(id)).concat(ids);
}

function moveGroup(
  pieces: Record<string, PieceRuntimeState>,
  groupId: string,
  dx: number,
  dy: number
) {
  const next = { ...pieces };
  const moved: string[] = [];
  for (const p of Object.values(pieces)) {
    if (p.groupId === groupId) {
      next[p.id] = { ...p, x: p.x + dx, y: p.y + dy };
      moved.push(p.id);
    }
  }
  return { next, moved };
}

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzleId: null,
  username: typeof window !== "undefined" ? localStorage.getItem("puzzle-username") : null,
  boardConfig: null,
  image: null,
  pieces: {},
  renderOrder: [],
  remoteSynced: false,
  previewVisible: false,
  showEdgesOnly: false,
  backgroundColor: "#7598b5",
  camera: { x: 0, y: 0, scale: 1 },
  activeDragGroupId: null,
  lastDragPos: null,
  playerCount: 0,
  remoteCursors: {},

  panCamera: (dx, dy) => set((state) => ({
    camera: { ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy }
  })),



  setCamera: (camera) => set({ camera }),

  startGroupDrag: (groupId, clientPos) => set((state) => {
    const groupPieceIds = Object.values(state.pieces)
      .filter((p) => p.groupId === groupId)
      .map((p) => p.id);

    return {
      activeDragGroupId: groupId,
      lastDragPos: { ...clientPos },
      renderOrder: bumpToTop(state.renderOrder, groupPieceIds)
    };
  }),

  updateGroupDrag: (clientPos) => set((state) => {
    if (!state.activeDragGroupId || !state.lastDragPos) return state;

    const dx = (clientPos.x - state.lastDragPos.x) / state.camera.scale;
    const dy = (clientPos.y - state.lastDragPos.y) / state.camera.scale;
    const { next } = moveGroup(state.pieces, state.activeDragGroupId, dx, dy);

    return { pieces: next, lastDragPos: { ...clientPos } };
  }),

  endGroupDrag: () => set({ activeDragGroupId: null, lastDragPos: null }),

  applyRemoteGroupPosition: (anchorId, x, y) => set((state) => {
    const anchor = state.pieces[anchorId];
    if (!anchor) return state;
    // Don't let a peer's stream fight the group we're holding.
    if (anchor.groupId === state.activeDragGroupId) return state;

    const { next, moved } = moveGroup(state.pieces, anchor.groupId, x - anchor.x, y - anchor.y);
    return { pieces: next, renderOrder: bumpToTop(state.renderOrder, moved) };
  }),

  applyGroupSnapshot: (groupId, positions) => set((state) => {
    const next = { ...state.pieces };
    for (const [id, pos] of Object.entries(positions)) {
      const p = next[id];
      if (p) next[id] = { ...p, groupId, x: pos.x, y: pos.y };
    }
    // If a peer's snap absorbed the group we're holding, drop our drag.
    const dragAbsorbed =
      state.activeDragGroupId !== null &&
      Object.values(state.pieces).some(
        (p) => p.groupId === state.activeDragGroupId && p.id in positions
      );
    return dragAbsorbed
      ? { pieces: next, activeDragGroupId: null, lastDragPos: null }
      : { pieces: next };
  }),

  applyBoardSnapshot: (pieces, renderOrder) => set((state) => {
    if (state.activeDragGroupId) return state;
    return { pieces, renderOrder, remoteSynced: true };
  }),

  mergeGroups: (groupIdToKeep, groupIdToMerge, snapDx, snapDy) => set((state) => {
    const newPieces = { ...state.pieces };
    Object.values(newPieces).forEach((p) => {
      if (p.groupId === groupIdToMerge) {
        newPieces[p.id] = {
          ...p,
          groupId: groupIdToKeep,
          x: p.x + snapDx,
          y: p.y + snapDy
        };
      }
    });
    return { pieces: newPieces };
  }),

  setPieces: (pieces, renderOrder) => set({ pieces, renderOrder }),
  setBoardConfig: (boardConfig) => set({ boardConfig }),

  resetBoard: () => {
    const { boardConfig } = get();
    if (!boardConfig) return;
    const { pieces, renderOrder } = generatePieces(boardConfig);
    set({ pieces, renderOrder, activeDragGroupId: null, lastDragPos: null });
  },

  setImage: (image) => set({ image }),

  setPuzzleId: (id) => set((state) => {
    if (state.puzzleId === id) return state;
    // The store outlives page navigation; don't carry one puzzle's board into another.
    return {
      puzzleId: id,
      pieces: {},
      renderOrder: [],
      boardConfig: null,
      image: null,
      remoteSynced: false,
      remoteCursors: {},
      activeDragGroupId: null,
      lastDragPos: null,
    };
  }),

  setUsername: (username) => {
    if (typeof window !== "undefined" && username) {
      localStorage.setItem("puzzle-username", username);
    }
    set({ username });
  },
  setPlayerCount: (count) => set({ playerCount: count }),

  loadSavedGame: async (puzzleId) => {
    try {
      const saved = await idbGet(`puzzle-${puzzleId}`);
      // A peer's live board beats a stale local save.
      if (saved && !get().remoteSynced) {
        set({ pieces: saved.pieces, renderOrder: saved.renderOrder, puzzleId });
        return true;
      }
    } catch (e) {
      console.error("Failed to load game", e);
    }
    return false;
  },

  clearSavedGame: async (puzzleId) => {
    try {
      await idbDel(`puzzle-${puzzleId}`);
    } catch (e) {
      console.error("Failed to clear game", e);
    }
  },

  togglePreview: () => set((state) => ({ previewVisible: !state.previewVisible })),
  toggleShowEdgesOnly: () => set((state) => ({ showEdgesOnly: !state.showEdgesOnly })),
  setBackgroundColor: (color) => set({ backgroundColor: color }),

  updateRemoteCursor: (id, x, y, color, username) => set((state) => ({
    remoteCursors: {
      ...state.remoteCursors,
      [id]: { x, y, color, username }
    }
  })),

  removeRemoteCursor: (id) => set((state) => {
    const newCursors = { ...state.remoteCursors };
    delete newCursors[id];
    return { remoteCursors: newCursors };
  })
}));

let supabaseSaveTimeout: ReturnType<typeof setTimeout>;

usePuzzleStore.subscribe((state, prevState) => {
  // Only auto-save if we have a puzzleId, pieces exist, and pieces/renderOrder actually changed.
  // We avoid saving mid-drag by checking if activeDragGroupId is null.
  if (
    state.puzzleId &&
    !state.activeDragGroupId &&
    Object.keys(state.pieces).length > 0 &&
    (state.pieces !== prevState.pieces || state.renderOrder !== prevState.renderOrder)
  ) {
    const payload = {
      pieces: state.pieces,
      renderOrder: state.renderOrder
    };
    
    // Local persistence
    idbSet(`puzzle-${state.puzzleId}`, payload).catch(e => console.error("Auto-save failed", e));
    
    // Server persistence (debounced)
    clearTimeout(supabaseSaveTimeout);
    supabaseSaveTimeout = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      supabase
        .from("puzzles")
        .update({ state: payload })
        .eq("id", state.puzzleId)
        .then(({ error }) => {
          if (error) console.error("Failed to save state to server", error);
        });
    }, 2000);
  }
});

