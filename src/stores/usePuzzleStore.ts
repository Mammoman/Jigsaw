import { create } from "zustand";
import { PieceRuntimeState } from "../types/puzzle";

interface PuzzleState {
  puzzleId: string | null;
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

  // Remote Multiplayer State
  remoteCursors: Record<string, { x: number; y: number; color: string }>;

  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (scaleDelta: number, focalPoint: { x: number; y: number }) => void;

  startGroupDrag: (groupId: string, clientPos: { x: number; y: number }) => void;
  updateGroupDrag: (clientPos: { x: number; y: number }) => void;
  endGroupDrag: () => void;
  applyRemoteDrag: (groupId: string, dx: number, dy: number) => void;

  mergeGroups: (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => void;
  setPieces: (pieces: Record<string, PieceRuntimeState>, renderOrder: string[]) => void;
  setImage: (image: HTMLImageElement) => void;
  
  toggleGhostImage: () => void;
  toggleShowEdgesOnly: () => void;

  updateRemoteCursor: (id: string, x: number, y: number, color: string) => void;
  removeRemoteCursor: (id: string) => void;
}

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzleId: null,
  seed: 42,
  image: null,
  pieces: {},
  renderOrder: [],
  ghostImageVisible: false,
  showEdgesOnly: false,
  camera: { x: 0, y: 0, scale: 1 },
  activeDragGroupId: null,
  lastDragPos: null,
  remoteCursors: {},

  panCamera: (dx, dy) => set((state) => ({
    camera: { ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy }
  })),

  zoomCamera: (scaleDelta, focalPoint) => set((state) => {
    const oldScale = state.camera.scale;
    let newScale = oldScale + scaleDelta;
    newScale = Math.min(Math.max(0.1, newScale), 5);
    const worldX = (focalPoint.x - state.camera.x) / oldScale;
    const worldY = (focalPoint.y - state.camera.y) / oldScale;

    return {
      camera: {
        x: focalPoint.x - worldX * newScale,
        y: focalPoint.y - worldY * newScale,
        scale: newScale
      }
    };
  }),

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

  toggleGhostImage: () => set((state) => ({ ghostImageVisible: !state.ghostImageVisible })),
  toggleShowEdgesOnly: () => set((state) => ({ showEdgesOnly: !state.showEdgesOnly })),

  updateRemoteCursor: (id, x, y, color) => set((state) => ({
    remoteCursors: {
      ...state.remoteCursors,
      [id]: { x, y, color }
    }
  })),

  removeRemoteCursor: (id) => set((state) => {
    const newCursors = { ...state.remoteCursors };
    delete newCursors[id];
    return { remoteCursors: newCursors };
  })
}));
