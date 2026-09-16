"use client";

import React, { useEffect, useRef, useState } from "react";
import { PiecePositions, usePuzzleStore } from "@/stores/usePuzzleStore";
import { createPiecePath } from "@/utils/bezierGenerator";
import { checkSnap } from "@/utils/snapEngine";
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
  const configRef = useRef<BoardConfig | null>(null);
  const remoteSynced = usePuzzleStore((s) => s.remoteSynced);

  // Interaction state
  const isPointerDown = useRef(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

      const tabs = generateTabs(config);
      const paths: Record<string, Path2D> = {};
      for (const [id, tab] of Object.entries(tabs)) {
        paths[id] = createPiecePath(config.pieceWidth, config.pieceHeight, tab);
      }
      piecePathsRef.current = paths;

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
      const { image, pieces, renderOrder, camera, activeDragGroupId, showEdgesOnly } =
        usePuzzleStore.getState();
      const config = configRef.current;
      if (!image || !config) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);



      // Frustum cull: skip pieces entirely outside the viewport (in world space).
      const viewL = -camera.x / camera.scale;
      const viewT = -camera.y / camera.scale;
      const viewR = viewL + canvas.width / camera.scale;
      const viewB = viewT + canvas.height / camera.scale;
      // Tabs extend beyond the piece box by up to ~44% of an edge.
      const padX = config.pieceWidth * 0.5;
      const padY = config.pieceHeight * 0.5;

      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;

      for (const id of renderOrder) {
        const p = pieces[id];
        const path = piecePathsRef.current[id];
        if (!p || !path) continue;

        if (showEdgesOnly) {
          const isEdge = p.row === 0 || p.row === rows - 1 || p.col === 0 || p.col === cols - 1;
          if (!isEdge) continue;
        }

        if (
          p.x + config.pieceWidth + padX < viewL ||
          p.x - padX > viewR ||
          p.y + config.pieceHeight + padY < viewT ||
          p.y - padY > viewB
        ) {
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);

        if (p.groupId === activeDragGroupId) {
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 15;
          ctx.shadowOffsetX = 5;
          ctx.shadowOffsetY = 5;
        }

        ctx.clip(path);
        ctx.drawImage(image, -p.col * config.pieceWidth, -p.row * config.pieceHeight);
        ctx.stroke(path);

        ctx.restore();
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
  const getCanvasPos = (e: React.PointerEvent | React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toWorld = (canvasPos: { x: number; y: number }) => {
    const { camera } = usePuzzleStore.getState();
    return {
      x: (canvasPos.x - camera.x) / camera.scale,
      y: (canvasPos.y - camera.y) / camera.scale,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDown.current = true;
    const pos = { x: e.clientX, y: e.clientY };
    lastPointerPos.current = pos;
    activePointers.current.set(e.pointerId, pos);

    const store = usePuzzleStore.getState();

    if (activePointers.current.size >= 2) return;

    if (e.button === 1 || e.button === 2) {
      return;
    }

    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;

    const canvasPos = getCanvasPos(e);
    const world = toWorld(canvasPos);
    const { pieces, renderOrder } = store;

    ctx.save();
    ctx.resetTransform();
    for (let i = renderOrder.length - 1; i >= 0; i--) {
      const id = renderOrder[i];
      const p = pieces[id];
      const path = piecePathsRef.current[id];
      if (!p || !path) continue;

      if (ctx.isPointInPath(path, world.x - p.x, world.y - p.y)) {
        ctx.restore();
        store.startGroupDrag(p.groupId, canvasPos);
        return;
      }
    }
    ctx.restore();

    // panning removed
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = { x: e.clientX, y: e.clientY };
    const store = usePuzzleStore.getState();

    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, pos);
    }


    const canvasPos = getCanvasPos(e);

    if (isPointerDown.current && activePointers.current.size === 1) {
      if (store.activeDragGroupId) {
        // Compute clamped position
        const { camera } = store;
        const groupPieces = Object.values(store.pieces).filter((p) => p.groupId === store.activeDragGroupId);
        if (groupPieces.length > 0) {
          const config = configRef.current!;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of groupPieces) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + config.pieceWidth);
            maxY = Math.max(maxY, p.y + config.pieceHeight);
          }
          
          // Current world position we are trying to move to
          const dx = (canvasPos.x - lastPointerPos.current.x) / camera.scale;
          const dy = (canvasPos.y - lastPointerPos.current.y) / camera.scale;
          
          // Viewport bounds in world space
          const viewL = -camera.x / camera.scale;
          const viewT = -camera.y / camera.scale;
          const viewR = viewL + window.innerWidth / camera.scale;
          const viewB = viewT + window.innerHeight / camera.scale;
          
          // Clamp dx, dy
          const newMinX = minX + dx;
          const newMaxX = maxX + dx;
          const newMinY = minY + dy;
          const newMaxY = maxY + dy;
          
          let clampedDx = dx;
          let clampedDy = dy;
          
          if (newMinX < viewL) clampedDx += (viewL - newMinX);
          else if (newMaxX > viewR) clampedDx -= (newMaxX - viewR);
          
          if (newMinY < viewT) clampedDy += (viewT - newMinY);
          else if (newMaxY > viewB) clampedDy -= (newMaxY - viewB);

          // Update store with clamped offset
          const clampedCanvasPos = {
            x: lastPointerPos.current.x + clampedDx * camera.scale,
            y: lastPointerPos.current.y + clampedDy * camera.scale
          };

          store.updateGroupDrag(clampedCanvasPos);
          lastPointerPos.current = clampedCanvasPos;
          
          const after = usePuzzleStore.getState();
          const anchor = Object.values(after.pieces).find((p) => p.groupId === after.activeDragGroupId);
          if (anchor) sendGroupMove(anchor.id, anchor.x, anchor.y);
        }
      }
    }

    const world = toWorld(canvasPos);
    sendPointerMove(world.x, world.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    activePointers.current.delete(e.pointerId);



    if (activePointers.current.size === 0) {
      isPointerDown.current = false;
    }


    lastPointerPos.current = { x: 0, y: 0 };

    const store = usePuzzleStore.getState();
    const draggedGroupId = store.activeDragGroupId;
    const config = configRef.current;
    if (!draggedGroupId || !config) return;

    store.endGroupDrag();

    const { pieces } = store;
    const activeGroupPieces = Object.values(pieces).filter((p) => p.groupId === draggedGroupId);
    const otherPieces = Object.values(pieces).filter((p) => p.groupId !== draggedGroupId);

    // Final resting position, sent unthrottled so peers land exactly where we did.
    if (activeGroupPieces[0]) {
      sendGroupMove(activeGroupPieces[0].id, activeGroupPieces[0].x, activeGroupPieces[0].y, true);
    }

    for (const ap of activeGroupPieces) {
      for (const op of otherPieces) {
        if (!checkSnap(ap, op, config.pieceWidth, config.pieceHeight)) continue;

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
