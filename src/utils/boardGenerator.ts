import { mulberry32 } from "./random";
import { PieceRuntimeState, TabPattern } from "../types/puzzle";

export interface BoardConfig {
  seed: number;
  rows: number;
  cols: number;
  pieceWidth: number;
  pieceHeight: number;
}

/** Same formula the landing page uses when it writes actual_rows/actual_cols. */
export function computeGrid(targetPieces: number, aspectRatio: number) {
  const cols = Math.max(2, Math.round(Math.sqrt(targetPieces * aspectRatio)));
  const rows = Math.max(2, Math.round(targetPieces / cols));
  return { rows, cols };
}

export function pieceId(row: number, col: number) {
  return `${row}-${col}`;
}

/**
 * Tab/blank pattern for every piece, derived only from the seed so all clients
 * agree on piece shapes without exchanging them.
 */
export function generateTabs({ seed, rows, cols }: BoardConfig): Record<string, TabPattern> {
  const random = mulberry32(seed);

  // hTabs[r][c] is the edge between (r,c) and (r,c+1); vTabs[r][c] between (r,c) and (r+1,c).
  const hTabs: number[][] = [];
  for (let r = 0; r < rows; r++) {
    hTabs.push(Array.from({ length: cols - 1 }, () => (random() > 0.5 ? 1 : -1)));
  }
  const vTabs: number[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    vTabs.push(Array.from({ length: cols }, () => (random() > 0.5 ? 1 : -1)));
  }

  const tabs: Record<string, TabPattern> = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tabs[pieceId(r, c)] = {
        top: r === 0 ? 0 : -vTabs[r - 1][c],
        bottom: r === rows - 1 ? 0 : vTabs[r][c],
        left: c === 0 ? 0 : -hTabs[r][c - 1],
        right: c === cols - 1 ? 0 : hTabs[r][c],
      };
    }
  }
  return tabs;
}

/**
 * Fresh, unsolved board: every piece is its own group, scattered around the
 * board perimeter in a neat grid layout. Deterministic in the seed and board 
 * size so every client starts from the exact same layout.
 */
export function generatePieces({ seed, rows, cols, pieceWidth, pieceHeight }: BoardConfig) {
  // Separate stream from the tab generator so scatter doesn't shift piece shapes.
  const random = mulberry32(seed ^ 0x9e3779b9);

  // Calculate required padding P so that the outer perimeter has enough slots
  // Total slots in outer grid = (rows + 2P) * (cols + 2P)
  // Inner hole = rows * cols
  // Available slots = outer - inner
  let P = 1;
  while ((rows + 2 * P) * (cols + 2 * P) - (rows * cols) < rows * cols) {
    P++;
  }
  
  // Create a slight gap between scattered pieces
  const spacing = 1.02; 
  
  // Collect all available perimeter slots
  const slots: { r: number; c: number }[] = [];
  for (let r = 0; r < rows + 2 * P; r++) {
    for (let c = 0; c < cols + 2 * P; c++) {
      // If it's inside the central "hole" (the solved puzzle area), skip it
      if (r >= P && r < P + rows && c >= P && c < P + cols) {
        continue;
      }
      slots.push({ r, c });
    }
  }

  // Shuffle slots deterministically
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const pieces: Record<string, PieceRuntimeState> = {};
  const renderOrder: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = pieceId(r, c);
      const slot = slots.pop()!; // Guaranteed to have enough slots
      
      // Calculate world coordinates. The central board is implicitly at x=0, y=0.
      // So slot.c = P maps to x = 0.
      const jitterX = (random() - 0.5) * (pieceWidth * 0.15);
      const jitterY = (random() - 0.5) * (pieceHeight * 0.15);

      pieces[id] = {
        id,
        row: r,
        col: c,
        x: Math.round((slot.c - P) * (pieceWidth * spacing) + jitterX),
        y: Math.round((slot.r - P) * (pieceHeight * spacing) + jitterY),
        groupId: id,
      };
      renderOrder.push(id);
    }
  }

  // Shuffle render order so pieces on the bottom render on top randomly
  for (let i = renderOrder.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [renderOrder[i], renderOrder[j]] = [renderOrder[j], renderOrder[i]];
  }

  return { pieces, renderOrder };
}
