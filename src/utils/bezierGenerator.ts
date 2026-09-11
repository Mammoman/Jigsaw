export function createPiecePath(
  width: number,
  height: number,
  tabs: { top: number; right: number; bottom: number; left: number }
): Path2D {
  const path = new Path2D();

  // Starting top-left
  path.moveTo(0, 0);

  // Top edge
  drawEdge(path, { x: 0, y: 0 }, { x: width, y: 0 }, tabs.top);

  // Right edge
  drawEdge(path, { x: width, y: 0 }, { x: width, y: height }, tabs.right);

  // Bottom edge
  drawEdge(path, { x: width, y: height }, { x: 0, y: height }, tabs.bottom);

  // Left edge
  drawEdge(path, { x: 0, y: height }, { x: 0, y: 0 }, tabs.left);

  path.closePath();
  return path;
}

function drawEdge(
  path: Path2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  tabType: number // 1 for outward, -1 for inward, 0 for flat
) {
  if (tabType === 0) {
    path.lineTo(p2.x, p2.y);
    return;
  }

  const vX = p2.x - p1.x;
  const vY = p2.y - p1.y;
  const L = Math.sqrt(vX * vX + vY * vY);

  // Normal vector
  // tabType = 1 -> outward (right-hand rule for clock-wise path, so n points out)
  // Our path is clockwise.
  const nX = -vY / L * tabType;
  const nY = vX / L * tabType;

  const addCurve = (
    u1: number, v1: number,
    u2: number, v2: number,
    u3: number, v3: number
  ) => {
    const cp1X = p1.x + u1 * vX + v1 * L * nX;
    const cp1Y = p1.y + u1 * vY + v1 * L * nY;
    const cp2X = p1.x + u2 * vX + v2 * L * nX;
    const cp2Y = p1.y + u2 * vY + v2 * L * nY;
    const endX = p1.x + u3 * vX + v3 * L * nX;
    const endY = p1.y + u3 * vY + v3 * L * nY;
    path.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  };

  addCurve(0.35, 0.00, 0.38, 0.05, 0.38, 0.10);
  addCurve(0.38, 0.15, 0.32, 0.25, 0.32, 0.30);
  addCurve(0.32, 0.38, 0.42, 0.44, 0.50, 0.44);
  addCurve(0.58, 0.44, 0.68, 0.38, 0.68, 0.30);
  addCurve(0.68, 0.25, 0.62, 0.15, 0.62, 0.10);
  addCurve(0.62, 0.05, 0.65, 0.00, 1.00, 0.00);
}
