"use client";

import React from "react";
import { RotateCcw, Image as ImageIcon, Frame, Mic, MicOff, Palette } from "lucide-react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";

const BG_COLORS = [
  { label: "Gray", value: "#a1a1aa" },
  { label: "Blue", value: "#7598b5" },
  { label: "Purple", value: "#c4b5fd" },
];

interface DockProps {
  onReset: () => void;
  isVoiceEnabled: boolean;
  isMuted: boolean;
  onJoinVoice: () => void;
  onToggleMute: () => void;
}

export default function Dock({ onReset, isVoiceEnabled, isMuted, onJoinVoice, onToggleMute }: DockProps) {
  const ghostImageVisible = usePuzzleStore((s) => s.ghostImageVisible);
  const showEdgesOnly = usePuzzleStore((s) => s.showEdgesOnly);
  const backgroundColor = usePuzzleStore((s) => s.backgroundColor);
  const { toggleGhostImage, toggleShowEdgesOnly, setBackgroundColor } = usePuzzleStore.getState();

  return (
    <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 pointer-events-none z-10">
      <div className="bg-black/60 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex items-center gap-1 sm:gap-2 pointer-events-auto border border-white/10 shadow-2xl">
        <button
          onClick={toggleGhostImage}
          className={`p-3.5 sm:p-3 rounded-xl transition-colors ${ghostImageVisible ? "bg-blue-500/30 text-blue-400" : "hover:bg-white/10 text-white"}`}
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
        <div className="flex gap-1 relative group">
          <button className="p-3.5 sm:p-3 hover:bg-white/10 rounded-xl text-white transition-colors">
            <Palette className="w-5 h-5" />
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex flex-col items-center">
            <div className="flex gap-2 bg-black/80 backdrop-blur rounded-xl p-2 shadow-xl border border-white/10">
              {BG_COLORS.map((bg) => (
                <button
                  key={bg.value}
                  className={`w-6 h-6 rounded-full border-2 ${backgroundColor === bg.value ? "border-white" : "border-transparent"}`}
                  style={{ backgroundColor: bg.value }}
                  onClick={() => setBackgroundColor(bg.value)}
                  title={bg.label}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="w-px h-6 bg-white/20 mx-1" />
        
        {isVoiceEnabled ? (
          <button
            onClick={onToggleMute}
            className={`p-3.5 sm:p-3 rounded-xl transition-colors ${isMuted ? "bg-red-500/30 text-red-400" : "bg-green-500/30 text-green-400"}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        ) : (
          <button
            onClick={onJoinVoice}
            className="p-3.5 sm:p-3 hover:bg-white/10 rounded-xl text-white transition-colors"
            title="Join Voice Chat"
          >
            <MicOff className="w-5 h-5 opacity-50" />
          </button>
        )}
        
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={onReset}
          className="p-3 hover:bg-red-500/20 hover:text-red-400 rounded-xl text-white transition-colors"
          title="Reset Puzzle"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
