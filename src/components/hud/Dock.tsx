"use client";

import React from "react";
import { ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon, Frame } from "lucide-react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";

export default function Dock() {
  const { zoomCamera, camera, ghostImageVisible, showEdgesOnly, toggleGhostImage, toggleShowEdgesOnly } = usePuzzleStore();

  const handleZoomIn = () => {
    zoomCamera(0.2, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  const handleZoomOut = () => {
    zoomCamera(-0.2, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  const handleReset = () => {
    window.location.reload();
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none z-10">
      <div className="bg-black/60 backdrop-blur-md rounded-2xl p-2 flex items-center gap-2 pointer-events-auto border border-white/10 shadow-2xl">
        <button
          onClick={toggleGhostImage}
          className={`p-3 rounded-xl transition-colors ${ghostImageVisible ? "bg-blue-500/30 text-blue-400" : "hover:bg-white/10 text-white"}`}
          title="Toggle Ghost Image"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          onClick={toggleShowEdgesOnly}
          className={`p-3 rounded-xl transition-colors ${showEdgesOnly ? "bg-blue-500/30 text-blue-400" : "hover:bg-white/10 text-white"}`}
          title="Show Edges Only"
        >
          <Frame className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={handleZoomIn}
          className="p-3 hover:bg-white/10 rounded-xl text-white transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={handleZoomOut}
          className="p-3 hover:bg-white/10 rounded-xl text-white transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <div className="px-3 text-white/50 text-sm font-mono">
          {Math.round(camera.scale * 100)}%
        </div>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={handleReset}
          className="p-3 hover:bg-red-500/20 hover:text-red-400 rounded-xl text-white transition-colors"
          title="Reset Puzzle"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
