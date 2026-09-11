"use client";

import React from "react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";

export default function RemoteCursors() {
  const { remoteCursors, camera } = usePuzzleStore();

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {Object.entries(remoteCursors).map(([id, cursor]) => {
        // We broadcast world coordinates, so we must project them to screen coordinates to overlay on top of canvas.
        const screenX = cursor.x * camera.scale + camera.x;
        const screenY = cursor.y * camera.scale + camera.y;

        return (
          <div
            key={id}
            className="absolute transition-all duration-75 ease-linear pointer-events-none"
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={cursor.color} stroke="white" strokeWidth="2">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z" />
            </svg>
            <div
              className="mt-1 ml-4 px-2 py-0.5 text-[10px] font-semibold text-white rounded shadow-md whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.username || `Player ${id.slice(0, 4)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
