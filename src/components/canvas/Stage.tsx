"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { PieceRuntimeState } from "@/types/puzzle";
import { createPiecePath } from "@/utils/bezierGenerator";
import { checkSnap } from "@/utils/snapEngine";
import { mulberry32 } from "@/utils/random";

interface StageProps {
  imageUrl: string;
  targetPieces?: number;
  sendPointerMove: (x: number, y: number, color: string, uname: string | null) => void;
  sendDragStream: (groupId: string, dx: number, dy: number) => void;
  sendMergeNotify: (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => void;
  myColor: string;
}

export default function Stage({ imageUrl, targetPieces = 24, sendPointerMove, sendDragStream, sendMergeNotify, myColor }: StageProps) {
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
    setCamera,
    startGroupDrag,
    updateGroupDrag,
    endGroupDrag,
    mergeGroups,
    activeDragGroupId,
    ghostImageVisible,
    showEdgesOnly,
    username,
  } = usePuzzleStore();

  const [initialized, setInitialized] = useState(false);
  const piecePathsRef = useRef<Record<string, Path2D>>({});
  const pieceDimensions = useRef({ width: 0, height: 0 });
  const gridDimensions = useRef({ rows: 0, cols: 0 });

  // Interaction state
  const isPointerDown = useRef(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialPinchScale = useRef<number | null>(null);
  const lastPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

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

    const scatterPieces = (piecesObj: Record<string, PieceRuntimeState>) => {
      const boardWidth = cols * pWidth;
      const boardHeight = rows * pHeight;
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      Object.values(piecesObj).forEach(p => {
        // Scatter around the perimeter of the board
        const angle = random() * Math.PI * 2;
        const dist = Math.max(boardWidth, boardHeight) / 2 + 100 + random() * (Math.max(w, h) / 2);
        
        p.x = boardWidth / 2 + Math.cos(angle) * dist - pWidth / 2;
        p.y = boardHeight / 2 + Math.sin(angle) * dist - pHeight / 2;
      });
    };

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

        newPieces[id] = {
          id,
          row: r,
          col: c,
          x: 0,
          y: 0,
          groupId: id,
        };
        newRenderOrder.push(id);
      }
    }

    scatterPieces(newPieces);

    const startX = window.innerWidth / 2 - (cols * pWidth) / 2;
    const startY = window.innerHeight / 2 - (rows * pHeight) / 2;
    
    // Zoom out a bit to see the scattered pieces
    usePuzzleStore.setState({ 
      camera: { x: startX, y: startY, scale: 0.6 } 
    });

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
  }, [initialized, image, camera, pieces, renderOrder, activeDragGroupId, ghostImageVisible, showEdgesOnly]);

  const getPointerPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDown.current = true;
    const pos = { x: e.clientX, y: e.clientY };
    lastPointerPos.current = pos;
    activePointers.current.set(e.pointerId, pos);

    if (activePointers.current.size === 2) {
      // Start pinch-to-zoom
      const pts = Array.from(activePointers.current.values());
      initialPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchScale.current = camera.scale;
      setIsPanning(false);
      if (activeDragGroupId) {
        endGroupDrag();
      }
      return;
    }

    if (activePointers.current.size > 2) return;

    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      return;
    }

    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;

    const canvasPos = getPointerPos(e);

    for (let i = renderOrder.length - 1; i >= 0; i--) {
      const id = renderOrder[i];
      const p = pieces[id];
      const path = piecePathsRef.current[id];

      const worldX = (canvasPos.x - camera.x) / camera.scale;
      const worldY = (canvasPos.y - camera.y) / camera.scale;

      const localX = worldX - p.x;
      const localY = worldY - p.y;

      ctx.save();
      ctx.resetTransform();
      if (ctx.isPointInPath(path, localX, localY)) {
        ctx.restore();
        startGroupDrag(p.groupId, canvasPos);
        return;
      }
      ctx.restore();
    }

    setIsPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = { x: e.clientX, y: e.clientY };
    
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, pos);
    }

    if (activePointers.current.size === 2 && initialPinchDist.current !== null && initialPinchScale.current !== null) {
      // Handle pinch-to-zoom
      const pts = Array.from(activePointers.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scaleFactor = currentDist / initialPinchDist.current;
      const newScale = Math.min(Math.max(0.1, initialPinchScale.current * scaleFactor), 5);
      
      const focalX = (pts[0].x + pts[1].x) / 2;
      const focalY = (pts[0].y + pts[1].y) / 2;

      const ds = newScale - camera.scale;
      const dx = -(focalX - camera.x) * (ds / camera.scale);
      const dy = -(focalY - camera.y) * (ds / camera.scale);

      setCamera({
        x: camera.x + dx,
        y: camera.y + dy,
        scale: newScale
      });
      return;
    }

    if (!isPointerDown.current || activePointers.current.size !== 1) {
      // Just hovering
      const canvasPos = getPointerPos(e);
      const worldX = (canvasPos.x - camera.x) / camera.scale;
      const worldY = (canvasPos.y - camera.y) / camera.scale;
      sendPointerMove(worldX, worldY, myColor, username);
      return;
    }

    if (isPanning) {
      const dx = pos.x - lastPointerPos.current.x;
      const dy = pos.y - lastPointerPos.current.y;
      panCamera(dx, dy);
      lastPointerPos.current = pos;
    } else if (activeDragGroupId) {
      const canvasPos = getPointerPos(e);
      const dx = (pos.x - lastPointerPos.current.x) / camera.scale;
      const dy = (pos.y - lastPointerPos.current.y) / camera.scale;
      updateGroupDrag(canvasPos);
      sendDragStream(activeDragGroupId, dx, dy);
      lastPointerPos.current = pos;
    }

    const canvasPos = getPointerPos(e);
    const worldX = (canvasPos.x - camera.x) / camera.scale;
    const worldY = (canvasPos.y - camera.y) / camera.scale;
    sendPointerMove(worldX, worldY, myColor, username);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    activePointers.current.delete(e.pointerId);

    if (activePointers.current.size < 2) {
      initialPinchDist.current = null;
      initialPinchScale.current = null;
    }

    if (activePointers.current.size === 0) {
      isPointerDown.current = false;
    }

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

    lastPointerPos.current = { x: 0, y: 0 };
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
