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
 * board perimeter. Deterministic in the seed and board size only (no viewport
 * dependence) so every client starts from the same layout.
 */
export function generatePieces({ seed, rows, cols, pieceWidth, pieceHeight }: BoardConfig) {
  // Separate stream from the tab generator so scatter doesn't shift piece shapes.
  const random = mulberry32(seed ^ 0x9e3779b9);
  const boardWidth = cols * pieceWidth;
  const boardHeight = rows * pieceHeight;
  const maxSide = Math.max(boardWidth, boardHeight);

  const pieces: Record<string, PieceRuntimeState> = {};
  const renderOrder: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = pieceId(r, c);
      const angle = random() * Math.PI * 2;
      const dist = maxSide / 2 + 100 + random() * (maxSide / 2);
      pieces[id] = {
        id,
        row: r,
        col: c,
        x: Math.round(boardWidth / 2 + Math.cos(angle) * dist - pieceWidth / 2),
        y: Math.round(boardHeight / 2 + Math.sin(angle) * dist - pieceHeight / 2),
        groupId: id,
      };
      renderOrder.push(id);
    }
  }

  return { pieces, renderOrder };
}
