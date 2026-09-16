import { PieceRuntimeState } from "../types/puzzle";

export const SNAP_TOLERANCE = 22;

export function checkSnap(
  pieceA: PieceRuntimeState,
  pieceB: PieceRuntimeState,
  pieceWidth: number,
  pieceHeight: number,
  tolerance: number = SNAP_TOLERANCE
): boolean {
  // Manhattan distance must be 1
  const rowDiff = Math.abs(pieceA.row - pieceB.row);
  const colDiff = Math.abs(pieceA.col - pieceB.col);
  if (rowDiff + colDiff !== 1) {
    return false;
  }

  // Expected relative offset
  const expectedDx = (pieceB.col - pieceA.col) * pieceWidth;
  const expectedDy = (pieceB.row - pieceA.row) * pieceHeight;

  // Actual relative offset
  const actualDx = pieceB.x - pieceA.x;
  const actualDy = pieceB.y - pieceA.y;

  // Error vector
  const errorX = actualDx - expectedDx;
  const errorY = actualDy - expectedDy;

  const distance = Math.sqrt(errorX * errorX + errorY * errorY);

  return distance <= tolerance;
}
