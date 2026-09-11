export interface PieceRuntimeState {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  groupId: string;
}

export interface TabPattern {
  top: number;    // 1 for outward tab, -1 for inward blank, 0 for straight edge
  right: number;
  bottom: number;
  left: number;
}
