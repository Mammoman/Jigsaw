import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { PieceRuntimeState } from "../types/puzzle";

interface PuzzleState {
  puzzleId: string | null;
  username: string | null;
  seed: number;
  image: HTMLImageElement | null;
  pieces: Record<string, PieceRuntimeState>;
  renderOrder: string[];

  // Settings
  ghostImageVisible: boolean;
  showEdgesOnly: boolean;

  camera: { x: number; y: number; scale: number };

  activeDragGroupId: string | null;
  lastDragPos: { x: number; y: number } | null;

  // Multiplayer lobby state
  playerCount: number;

  // Remote Multiplayer State
  remoteCursors: Record<string, { x: number; y: number; color: string; username?: string }>;

  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (scaleDelta: number, focalPoint: { x: number; y: number }) => void;
  setCamera: (camera: { x: number; y: number; scale: number }) => void;

  startGroupDrag: (groupId: string, clientPos: { x: number; y: number }) => void;
  updateGroupDrag: (clientPos: { x: number; y: number }) => void;
  endGroupDrag: () => void;
  applyRemoteDrag: (groupId: string, dx: number, dy: number) => void;

  mergeGroups: (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => void;
  setPieces: (pieces: Record<string, PieceRuntimeState>, renderOrder: string[]) => void;
  setImage: (image: HTMLImageElement) => void;
  setPuzzleId: (id: string) => void;
  setUsername: (username: string | null) => void;
  setPlayerCount: (count: number) => void;
  loadSavedGame: (puzzleId: string) => Promise<boolean>;
  clearSavedGame: (puzzleId: string) => Promise<void>;
  
  toggleGhostImage: () => void;
  toggleShowEdgesOnly: () => void;

  updateRemoteCursor: (id: string, x: number, y: number, color: string, username?: string) => void;
  removeRemoteCursor: (id: string) => void;
}

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzleId: null,
  username: null,
  seed: 42,
  image: null,
  pieces: {},
  renderOrder: [],
  ghostImageVisible: false,
  showEdgesOnly: false,
  camera: { x: 0, y: 0, scale: 1 },
  activeDragGroupId: null,
  lastDragPos: null,
  playerCount: 0,
  remoteCursors: {},

  panCamera: (dx, dy) => set((state) => ({
    camera: { ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy }
  })),

  zoomCamera: (scaleDelta, focalPoint) => set((state) => {
    const scaleFactor = 1 + scaleDelta;
    const newScale = Math.min(Math.max(0.1, state.camera.scale * scaleFactor), 5);

    const ds = newScale - state.camera.scale;
    const dx = -(focalPoint.x - state.camera.x) * (ds / state.camera.scale);
    const dy = -(focalPoint.y - state.camera.y) * (ds / state.camera.scale);

    return {
      camera: {
        x: state.camera.x + dx,
        y: state.camera.y + dy,
        scale: newScale
      }
    };
  }),

  setCamera: (camera) => set({ camera }),

  startGroupDrag: (groupId, clientPos) => set((state) => {
    const groupPieceIds = Object.values(state.pieces)
      .filter((p) => p.groupId === groupId)
      .map((p) => p.id);

    const newRenderOrder = state.renderOrder.filter(id => !groupPieceIds.includes(id)).concat(groupPieceIds);

    return {
      activeDragGroupId: groupId,
      lastDragPos: { ...clientPos },
      renderOrder: newRenderOrder
    };
  }),

  updateGroupDrag: (clientPos) => set((state) => {
    if (!state.activeDragGroupId || !state.lastDragPos) return state;

    const dx = (clientPos.x - state.lastDragPos.x) / state.camera.scale;
    const dy = (clientPos.y - state.lastDragPos.y) / state.camera.scale;

    const newPieces = { ...state.pieces };
    Object.values(newPieces).forEach((p) => {
      if (p.groupId === state.activeDragGroupId) {
        newPieces[p.id] = { ...p, x: p.x + dx, y: p.y + dy };
      }
    });

    return {
      pieces: newPieces,
      lastDragPos: { ...clientPos }
    };
  }),

  endGroupDrag: () => set((state) => {
    return {
      activeDragGroupId: null,
      lastDragPos: null
    };
  }),

  applyRemoteDrag: (groupId, dx, dy) => set((state) => {
    const newPieces = { ...state.pieces };
    let moved = false;
    Object.values(newPieces).forEach((p) => {
      if (p.groupId === groupId) {
        newPieces[p.id] = { ...p, x: p.x + dx, y: p.y + dy };
        moved = true;
      }
    });
    
    if (!moved) return state;
    
    // Also bump to top of render order
    const groupPieceIds = Object.values(state.pieces)
      .filter((p) => p.groupId === groupId)
      .map((p) => p.id);
    const newRenderOrder = state.renderOrder.filter(id => !groupPieceIds.includes(id)).concat(groupPieceIds);
    
    return { pieces: newPieces, renderOrder: newRenderOrder };
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

  setPieces: (pieces, renderOrder) => set(() => ({ pieces, renderOrder })),
  setImage: (image) => set(() => ({ image })),
  setPuzzleId: (id) => set(() => ({ puzzleId: id })),
  setUsername: (username) => set(() => ({ username })),
  setPlayerCount: (count) => set(() => ({ playerCount: count })),

  loadSavedGame: async (puzzleId) => {
    try {
      const saved = await idbGet(`puzzle-${puzzleId}`);
      if (saved) {
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

  toggleGhostImage: () => set((state) => ({ ghostImageVisible: !state.ghostImageVisible })),
  toggleShowEdgesOnly: () => set((state) => ({ showEdgesOnly: !state.showEdgesOnly })),

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

usePuzzleStore.subscribe((state, prevState) => {
  // Only auto-save if we have a puzzleId, pieces exist, and pieces/renderOrder actually changed.
  // We avoid saving mid-drag by checking if activeDragGroupId is null.
  if (
    state.puzzleId &&
    !state.activeDragGroupId &&
    Object.keys(state.pieces).length > 0 &&
    (state.pieces !== prevState.pieces || state.renderOrder !== prevState.renderOrder)
  ) {
    idbSet(`puzzle-${state.puzzleId}`, {
      pieces: state.pieces,
      renderOrder: state.renderOrder
    }).catch(e => console.error("Auto-save failed", e));
  }
});
