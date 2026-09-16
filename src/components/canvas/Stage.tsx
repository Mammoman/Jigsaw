"use client";

import React, { useEffect, useRef, useState } from "react";
import { PiecePositions, usePuzzleStore } from "@/stores/usePuzzleStore";
import { createPiecePath } from "@/utils/bezierGenerator";
import { checkSnap, SNAP_TOLERANCE } from "@/utils/snapEngine";
import { BoardConfig, generatePieces, generateTabs } from "@/utils/boardGenerator";

interface StageProps {
  imageUrl: string;
  seed: number;
  rows: number;
  cols: number;
  sendPointerMove: (x: number, y: number) => void;
  sendGroupMove: (anchorId: string, x: number, y: number, force?: boolean) => void;
  sendGroupMerge: (groupId: string, positions: PiecePositions) => void;
}

/** Pre-rendered piece: image clipped to its outline, with tabs, at 1:1 world scale. */
interface Sprite {
  canvas: HTMLCanvasElement;
  /** World-space offset from the piece origin to the sprite's top-left (outward tabs stick out). */
  padLeft: number;
  padTop: number;
  /** Extents past the piece box on the far sides, for culling. */
  padRight: number;
  padBottom: number;
}

/** Snap when the error is within this many *screen* pixels, whatever the zoom. */
const SNAP_SCREEN_PX = 18;

/** Snapshot taken on pointerdown so the group follows the cursor 1:1 from the grab point. */
interface DragState {
  anchorId: string;
  /** World offset from the cursor to the anchor piece's origin at grab time. */
  grabDx: number;
  grabDy: number;
  /** Group bounding box relative to the anchor origin, for viewport clamping. */
  minDx: number;
  minDy: number;
  maxDx: number;
  maxDy: number;
}

function playSnapSound() {
  try {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch {
    // Ignore audio errors
  }
}

/**
 * The whole game surface. Deliberately does not subscribe to the store via
 * React: input handlers and the render loop read `usePuzzleStore.getState()`
 * directly so a 60 Hz drag doesn't re-render the React tree.
 *
 * Rendering: each piece is rasterised once into a sprite (clip + drawImage +
 * outline). Per frame we only blit sprites, which is what keeps dragging
 * smooth at several hundred pieces.
 */
export default function Stage({
  imageUrl,
  seed,
  rows,
  cols,
  sendPointerMove,
  sendGroupMove,
  sendGroupMerge,
}: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initialized, setInitialized] = useState(false);
  const piecePathsRef = useRef<Record<string, Path2D>>({});
  const spritesRef = useRef<Record<string, Sprite>>({});
  const configRef = useRef<BoardConfig | null>(null);
  const remoteSynced = usePuzzleStore((s) => s.remoteSynced);

  // Interaction state
  const activePointers = useRef<Set<number>>(new Set());
  const dragRef = useRef<DragState | null>(null);

  // ── Board setup ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      if (cancelled) return;

      const config: BoardConfig = {
        seed,
        rows,
        cols,
        pieceWidth: Math.floor(img.width / cols),
        pieceHeight: Math.floor(img.height / rows),
      };
      configRef.current = config;

      // A tab lobe reaches ~44% of its *edge length* outward, so a tab on a
      // vertical edge sticks out horizontally by 0.44 * pieceHeight and vice
      // versa. Pad each sprite only on sides that actually have an outward tab:
      // every extra pixel here is overdraw on every frame.
      const tabH = Math.ceil(config.pieceHeight * 0.46);
      const tabV = Math.ceil(config.pieceWidth * 0.46);
      const edge = 2; // room for the 1px outline

      const tabs = generateTabs(config);
      const paths: Record<string, Path2D> = {};
      const sprites: Record<string, Sprite> = {};
      for (const [id, tab] of Object.entries(tabs)) {
        const path = createPiecePath(config.pieceWidth, config.pieceHeight, tab);
        paths[id] = path;

        const padLeft = (tab.left === 1 ? tabH : 0) + edge;
        const padRight = (tab.right === 1 ? tabH : 0) + edge;
        const padTop = (tab.top === 1 ? tabV : 0) + edge;
        const padBottom = (tab.bottom === 1 ? tabV : 0) + edge;

        const [r, c] = id.split("-").map(Number);
        const canvas = document.createElement("canvas");
        canvas.width = config.pieceWidth + padLeft + padRight;
        canvas.height = config.pieceHeight + padTop + padBottom;
        const sctx = canvas.getContext("2d");
        if (!sctx) continue;
        sctx.translate(padLeft, padTop);
        sctx.save();
        sctx.clip(path);
        sctx.drawImage(img, -c * config.pieceWidth, -r * config.pieceHeight);
        sctx.restore();
        sctx.strokeStyle = "rgba(255,255,255,0.4)";
        sctx.lineWidth = 1;
        sctx.stroke(path);
        sprites[id] = { canvas, padLeft, padTop, padRight, padBottom };
      }
      piecePathsRef.current = paths;
      spritesRef.current = sprites;

      const store = usePuzzleStore.getState();
      store.setImage(img);
      store.setBoardConfig(config);
      // Only scatter if nothing restored a board first (local save or peer snapshot).
      if (Object.keys(store.pieces).length === 0) {
        const { pieces, renderOrder } = generatePieces(config);
        store.setPieces(pieces, renderOrder);
      }

      setInitialized(true);
    };
    return () => {
      cancelled = true;
    };
  }, [imageUrl, seed, rows, cols]);

  // Recalculate camera based on actual pieces (handles both Player 1 scatter and Player 2 sync)
  useEffect(() => {
    if (!initialized) return;

    const config = configRef.current;
    if (!config) return;

    const updateCamera = () => {
      const allPieces = Object.values(usePuzzleStore.getState().pieces);
      if (allPieces.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of allPieces) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + config.pieceWidth);
        maxY = Math.max(maxY, p.y + config.pieceHeight);
      }

      const padX = config.pieceWidth * 0.5;
      const padY = config.pieceHeight * 0.5;
      const extentW = maxX - minX + padX * 2;
      const extentH = maxY - minY + padY * 2;

      const scale = Math.min(window.innerWidth / extentW, window.innerHeight / extentH);
      usePuzzleStore.getState().setCamera({
        x: window.innerWidth / 2 - ((minX + maxX) / 2) * scale,
        y: window.innerHeight / 2 - ((minY + maxY) / 2) * scale,
        scale,
      });
    };

    updateCamera();

    const handleResize = () => updateCamera();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [initialized, remoteSynced]);

  // ── Render loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dirty = true;
    let animationFrameId = 0;

    const draw = () => {
      const { pieces, renderOrder, camera, activeDragGroupId, showEdgesOnly } =
        usePuzzleStore.getState();
      const config = configRef.current;
      if (!config) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);

      // Frustum cull: skip pieces entirely outside the viewport (in world space).
      const viewL = -camera.x / camera.scale;
      const viewT = -camera.y / camera.scale;
      const viewR = viewL + canvas.width / camera.scale;
      const viewB = viewT + canvas.height / camera.scale;

      const isVisible = (id: string) => {
        const p = pieces[id];
        const sprite = spritesRef.current[id];
        if (!p || !sprite) return false;
        if (showEdgesOnly) {
          const isEdge = p.row === 0 || p.row === rows - 1 || p.col === 0 || p.col === cols - 1;
          if (!isEdge) return false;
        }
        return !(
          p.x + config.pieceWidth + sprite.padRight < viewL ||
          p.x - sprite.padLeft > viewR ||
          p.y + config.pieceHeight + sprite.padBottom < viewT ||
          p.y - sprite.padTop > viewB
        );
      };

      // Cheap flat shadow under the dragged group (a blurred shadow per piece is
      // far too expensive once a group has grown).
      if (activeDragGroupId) {
        const shadowOffset = 8 / camera.scale;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (const id of renderOrder) {
          const p = pieces[id];
          if (!p || p.groupId !== activeDragGroupId || !isVisible(id)) continue;
          ctx.save();
          ctx.translate(p.x + shadowOffset, p.y + shadowOffset);
          ctx.fill(piecePathsRef.current[id]);
          ctx.restore();
        }
      }

      for (const id of renderOrder) {
        if (!isVisible(id)) continue;
        const p = pieces[id];
        const sprite = spritesRef.current[id];
        ctx.drawImage(sprite.canvas, p.x - sprite.padLeft, p.y - sprite.padTop);
      }

      ctx.restore();
    };

    const loop = () => {
      if (dirty) {
        dirty = false;
        draw();
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    const handleResizeCanvas = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      dirty = true;
    };

    const unsubscribe = usePuzzleStore.subscribe(() => {
      dirty = true;
    });
    window.addEventListener("resize", handleResizeCanvas);
    handleResizeCanvas();
    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      unsubscribe();
      window.removeEventListener("resize", handleResizeCanvas);
    };
  }, [initialized, rows, cols]);

  // ── Input ──────────────────────────────────────────────────────
  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { camera } = usePuzzleStore.getState();
    return {
      x: (e.clientX - rect.left - camera.x) / camera.scale,
      y: (e.clientY - rect.top - camera.y) / camera.scale,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Capture so the drag keeps tracking outside the canvas. Can throw if the
    // pointer is already gone (pointercancel race); losing capture is harmless.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    activePointers.current.add(e.pointerId);

    // Only the first finger / left button drags.
    if (activePointers.current.size > 1 || e.button !== 0) return;

    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;

    const store = usePuzzleStore.getState();
    const config = configRef.current;
    if (!config) return;

    const world = toWorld(e);
    const { pieces, renderOrder } = store;

    // Hit-test top-most first. isPointInPath works in the untransformed space of
    // the path, so we offset the point by the piece origin instead of transforming.
    let hit: string | null = null;
    for (let i = renderOrder.length - 1; i >= 0; i--) {
      const id = renderOrder[i];
      const p = pieces[id];
      const path = piecePathsRef.current[id];
      if (!p || !path) continue;
      if (ctx.isPointInPath(path, world.x - p.x, world.y - p.y)) {
        hit = id;
        break;
      }
    }
    if (!hit) return;

    const anchor = pieces[hit];
    let minDx = Infinity, minDy = Infinity, maxDx = -Infinity, maxDy = -Infinity;
    for (const p of Object.values(pieces)) {
      if (p.groupId !== anchor.groupId) continue;
      minDx = Math.min(minDx, p.x - anchor.x);
      minDy = Math.min(minDy, p.y - anchor.y);
      maxDx = Math.max(maxDx, p.x - anchor.x + config.pieceWidth);
      maxDy = Math.max(maxDy, p.y - anchor.y + config.pieceHeight);
    }

    dragRef.current = {
      anchorId: hit,
      grabDx: anchor.x - world.x,
      grabDy: anchor.y - world.y,
      minDx,
      minDy,
      maxDx,
      maxDy,
    };
    store.startGroupDrag(anchor.groupId, { x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e);
    const drag = dragRef.current;

    if (drag && activePointers.current.has(e.pointerId) && activePointers.current.size === 1) {
      const store = usePuzzleStore.getState();
      const { camera } = store;

      // Where the anchor wants to be so the grab point stays under the cursor...
      let x = world.x + drag.grabDx;
      let y = world.y + drag.grabDy;

      // ...clamped so the whole group stays inside the viewport. Because this is
      // computed from the grab point every time, pushing into an edge never makes
      // the piece drift away from the cursor.
      const viewL = -camera.x / camera.scale;
      const viewT = -camera.y / camera.scale;
      const viewR = viewL + window.innerWidth / camera.scale;
      const viewB = viewT + window.innerHeight / camera.scale;
      x = Math.min(Math.max(x, viewL - drag.minDx), viewR - drag.maxDx);
      y = Math.min(Math.max(y, viewT - drag.minDy), viewB - drag.maxDy);

      store.moveDragGroupTo(drag.anchorId, x, y);
      sendGroupMove(drag.anchorId, x, y);
    }

    sendPointerMove(world.x, world.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    activePointers.current.delete(e.pointerId);

    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    const store = usePuzzleStore.getState();
    const draggedGroupId = store.activeDragGroupId;
    const config = configRef.current;
    store.endGroupDrag();
    if (!draggedGroupId || !config) return;

    const { pieces } = store;
    const activeGroupPieces = Object.values(pieces).filter((p) => p.groupId === draggedGroupId);
    const otherPieces = Object.values(pieces).filter((p) => p.groupId !== draggedGroupId);

    // Final resting position, sent unthrottled so peers land exactly where we did.
    const anchor = pieces[drag.anchorId];
    if (anchor) sendGroupMove(anchor.id, anchor.x, anchor.y, true);

    // Fixed screen distance so snapping feels the same however far the board is zoomed out.
    const tolerance = Math.max(SNAP_TOLERANCE, SNAP_SCREEN_PX / store.camera.scale);

    for (const ap of activeGroupPieces) {
      for (const op of otherPieces) {
        if (!checkSnap(ap, op, config.pieceWidth, config.pieceHeight, tolerance)) continue;

        const targetX = op.x + (ap.col - op.col) * config.pieceWidth;
        const targetY = op.y + (ap.row - op.row) * config.pieceHeight;

        store.mergeGroups(op.groupId, draggedGroupId, targetX - ap.x, targetY - ap.y);
        playSnapSound();

        // Publish the exact layout of the merged group so peers converge regardless of drift.
        const merged = usePuzzleStore.getState().pieces;
        const positions: PiecePositions = {};
        for (const p of Object.values(merged)) {
          if (p.groupId === op.groupId) positions[p.id] = { x: p.x, y: p.y };
        }
        sendGroupMerge(op.groupId, positions);
        return;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full touch-none block overscroll-none"
    />
  );
}
