"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { PieceRuntimeState } from "@/types/puzzle";
import { createPiecePath } from "@/utils/bezierGenerator";
import { checkSnap } from "@/utils/snapEngine";
import { mulberry32 } from "@/utils/random";
import { usePuzzleMultiplayer } from "@/hooks/usePuzzleMultiplayer";

interface StageProps {
  imageUrl: string;
  targetPieces?: number;
}

export default function Stage({ imageUrl, targetPieces = 24 }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    pieces,
    renderOrder,
    camera,
    setPieces,
    setImage,
    image,
    panCamera,
    zoomCamera,
    startGroupDrag,
    updateGroupDrag,
    endGroupDrag,
    mergeGroups,
    activeDragGroupId,
    ghostImageVisible,
    showEdgesOnly,
  } = usePuzzleStore();

  const [initialized, setInitialized] = useState(false);
  const piecePathsRef = useRef<Record<string, Path2D>>({});
  const pieceDimensions = useRef({ width: 0, height: 0 });
  const gridDimensions = useRef({ rows: 0, cols: 0 });

  const { sendPointerMove, sendDragStream, sendMergeNotify } = usePuzzleMultiplayer("puzzle-room-1");
  const myColor = useRef(`hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`).current;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      setImage(img);
      initializeBoard(img);
    };
  }, [imageUrl]);

  const initializeBoard = (img: HTMLImageElement) => {
    const aspectRatio = img.width / img.height;

    const cols = Math.max(2, Math.round(Math.sqrt(targetPieces * aspectRatio)));
    const rows = Math.max(2, Math.round(targetPieces / cols));

    const pWidth = Math.floor(img.width / cols);
    const pHeight = Math.floor(img.height / rows);
    pieceDimensions.current = { width: pWidth, height: pHeight };
    gridDimensions.current = { rows, cols };

    const random = mulberry32(42);

    const hTabs: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const rowTabs = [];
      for (let c = 0; c < cols - 1; c++) {
        rowTabs.push(random() > 0.5 ? 1 : -1);
      }
      hTabs.push(rowTabs);
    }

    const vTabs: number[][] = [];
    for (let r = 0; r < rows - 1; r++) {
      const colTabs = [];
      for (let c = 0; c < cols; c++) {
        colTabs.push(random() > 0.5 ? 1 : -1);
      }
      vTabs.push(colTabs);
    }

    const newPieces: Record<string, PieceRuntimeState> = {};
    const newRenderOrder: string[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `${r}-${c}`;

        const top = r === 0 ? 0 : -vTabs[r - 1][c];
        const bottom = r === rows - 1 ? 0 : vTabs[r][c];
        const left = c === 0 ? 0 : -hTabs[r][c - 1];
        const right = c === cols - 1 ? 0 : hTabs[r][c];

        const path = createPiecePath(pWidth, pHeight, { top, right, bottom, left });
        piecePathsRef.current[id] = path;

        // Scatter starting positions
        const startX = c * pWidth * 1.1 + 100;
        const startY = r * pHeight * 1.1 + 100;

        newPieces[id] = {
          id,
          row: r,
          col: c,
          x: startX,
          y: startY,
          groupId: id,
        };
        newRenderOrder.push(id);
      }
    }

    setPieces(newPieces, newRenderOrder);
    setInitialized(true);
  };

  useEffect(() => {
    if (!initialized || !image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);

      if (ghostImageVisible && image) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.drawImage(image, 0, 0);
        ctx.restore();
      }

      for (const id of renderOrder) {
        const p = pieces[id];
        if (!p) continue;

        if (showEdgesOnly) {
          const isEdge = p.row === 0 || p.row === gridDimensions.current.rows - 1 || p.col === 0 || p.col === gridDimensions.current.cols - 1;
          if (!isEdge) continue;
        }

        const path = piecePathsRef.current[id];

        ctx.save();
        ctx.translate(p.x, p.y);

        if (p.groupId === activeDragGroupId) {
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 15;
          ctx.shadowOffsetX = 5;
          ctx.shadowOffsetY = 5;
        }

        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;

        ctx.clip(path);

        const pWidth = pieceDimensions.current.width;
        const pHeight = pieceDimensions.current.height;
        const srcX = p.col * pWidth;
        const srcY = p.row * pHeight;

        ctx.drawImage(image, -srcX, -srcY);
        ctx.stroke(path);

        ctx.restore();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [initialized, image, camera, pieces, renderOrder, activeDragGroupId]);

  const [isPanning, setIsPanning] = useState(false);
  const lastPointerPos = useRef<{ x: number; y: number } | null>(null);

  const getPointerPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);

    const pos = getPointerPos(e);
    lastPointerPos.current = pos;

    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      return;
    }

    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;

    for (let i = renderOrder.length - 1; i >= 0; i--) {
      const id = renderOrder[i];
      const p = pieces[id];
      const path = piecePathsRef.current[id];

      const worldX = (pos.x - camera.x) / camera.scale;
      const worldY = (pos.y - camera.y) / camera.scale;

      const localX = worldX - p.x;
      const localY = worldY - p.y;

      ctx.save();
      ctx.resetTransform();
      if (ctx.isPointInPath(path, localX, localY)) {
        ctx.restore();
        startGroupDrag(p.groupId, pos);
        return;
      }
      ctx.restore();
    }

    setIsPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!lastPointerPos.current) return;
    const pos = getPointerPos(e);

    if (isPanning) {
      const dx = pos.x - lastPointerPos.current.x;
      const dy = pos.y - lastPointerPos.current.y;
      panCamera(dx, dy);
      lastPointerPos.current = pos;
    } else if (activeDragGroupId) {
      const dx = (pos.x - lastPointerPos.current.x) / camera.scale;
      const dy = (pos.y - lastPointerPos.current.y) / camera.scale;
      updateGroupDrag(pos);
      sendDragStream(activeDragGroupId, dx, dy);
    }

    const worldX = (pos.x - camera.x) / camera.scale;
    const worldY = (pos.y - camera.y) / camera.scale;
    sendPointerMove(worldX, worldY, myColor);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
    }

    const playSnapSound = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } catch (e) {
        // Ignore audio errors
      }
    };

    if (activeDragGroupId) {
      endGroupDrag();

      const activeGroupPieces = Object.values(pieces).filter(
        (p) => p.groupId === activeDragGroupId
      );
      const otherPieces = Object.values(pieces).filter(
        (p) => p.groupId !== activeDragGroupId
      );

      let snapped = false;
      for (const ap of activeGroupPieces) {
        for (const op of otherPieces) {
          if (
            checkSnap(
              ap,
              op,
              pieceDimensions.current.width,
              pieceDimensions.current.height
            )
          ) {
            const expectedDx = (ap.col - op.col) * pieceDimensions.current.width;
            const expectedDy = (ap.row - op.row) * pieceDimensions.current.height;

            const targetX = op.x + expectedDx;
            const targetY = op.y + expectedDy;

            const snapDx = targetX - ap.x;
            const snapDy = targetY - ap.y;

            mergeGroups(op.groupId, activeDragGroupId, snapDx, snapDy);
            snapped = true;
            playSnapSound();
            sendMergeNotify(op.groupId, activeDragGroupId, snapDx, snapDy);
            break;
          }
        }
        if (snapped) break;
      }
    }

    lastPointerPos.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const pos = {
      x: e.clientX - canvasRef.current!.getBoundingClientRect().left,
      y: e.clientY - canvasRef.current!.getBoundingClientRect().top,
    };
    const scaleDelta = e.deltaY < 0 ? 0.1 : -0.1;
    zoomCamera(scaleDelta, pos);
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full touch-none block"
    />
  );
}
