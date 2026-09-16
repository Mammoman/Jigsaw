"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { Clock, CheckCircle2, Share2, Check, RotateCcw, Image as ImageIcon, Frame, Mic, MicOff, Palette } from "lucide-react";

const BG_COLORS = [
  { label: "Gray", value: "#a1a1aa" },
  { label: "Blue", value: "#7598b5" },
  { label: "Purple", value: "#c4b5fd" },
];

interface TopNavProps {
  isIdle?: boolean;
  onReset?: () => void;
  isVoiceEnabled?: boolean;
  isMuted?: boolean;
  onJoinVoice?: () => void;
  onToggleMute?: () => void;
}

export default function TopNav({
  isIdle = false,
  onReset,
  isVoiceEnabled = false,
  isMuted = false,
  onJoinVoice,
  onToggleMute
}: TopNavProps) {
  const pieces = usePuzzleStore((s) => s.pieces);
  const previewVisible = usePuzzleStore((s) => s.previewVisible);
  const showEdgesOnly = usePuzzleStore((s) => s.showEdgesOnly);
  const backgroundColor = usePuzzleStore((s) => s.backgroundColor);
  const { togglePreview, toggleShowEdgesOnly, setBackgroundColor } = usePuzzleStore.getState();

  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalPieces = Object.keys(pieces).length;
  const uniqueGroups = new Set(Object.values(pieces).map((p) => p.groupId)).size;
  const connected = totalPieces - uniqueGroups;
  const progress = totalPieces <= 1 ? 0 : Math.round((connected / (totalPieces - 1)) * 100);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleShare = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
      {/* Left: Combined TopNav and Dock */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md rounded-xl p-3 flex items-center gap-4 text-white border border-white/10 shadow-xl max-w-fit">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="font-mono text-lg font-medium">{formatTime(elapsed)}</span>
          </div>
          <div className="w-px h-6 bg-white/20" />
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Progress</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{progress}%</span>
            </div>
          </div>
          <div className="w-px h-6 bg-white/20" />
          {/* Share button */}
          <button
            onClick={handleShare}
            title="Copy invite link"
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors px-1 py-0.5 rounded ${
              copied ? "text-green-400" : "text-white/60 hover:text-white"
            }`}
          >
            {copied ? (
              <><Check className="w-4 h-4" /><span className="hidden sm:inline">Copied!</span></>
            ) : (
              <><Share2 className="w-4 h-4" /><span className="hidden sm:inline">Invite</span></>
            )}
          </button>
          
          <div className="w-px h-6 bg-white/20" />
          {/* Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center p-1 hover:bg-white/10 rounded transition-colors"
            title="Menu"
          >
            <div className="flex flex-col gap-[3px] items-center justify-center w-5 h-5">
              <span className="w-1 h-1 bg-white rounded-full"></span>
              <span className="w-1 h-1 bg-white rounded-full"></span>
              <span className="w-1 h-1 bg-white rounded-full"></span>
            </div>
          </button>
        </div>

        {/* Action Menu (formerly Dock) */}
        {menuOpen && (
          <div className="bg-black/60 backdrop-blur-md rounded-xl p-1.5 flex items-center gap-1 text-white border border-white/10 shadow-xl max-w-fit animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              onClick={togglePreview}
              className={`p-2 sm:p-2.5 rounded-lg transition-colors ${previewVisible ? "bg-blue-500/30 text-blue-400" : "hover:bg-white/10"}`}
              title="Toggle Image Preview"
            >
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={toggleShowEdgesOnly}
              className={`p-2 sm:p-2.5 rounded-lg transition-colors ${showEdgesOnly ? "bg-blue-500/30 text-blue-400" : "hover:bg-white/10"}`}
              title="Show Edges Only"
            >
              <Frame className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            <div className="flex gap-1 relative group">
              <button className="p-2 sm:p-2.5 hover:bg-white/10 rounded-lg transition-colors">
                <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="absolute top-full left-0 pt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex flex-col items-start">
                <div className="flex gap-2 bg-black/80 backdrop-blur rounded-xl p-2 shadow-xl border border-white/10">
                  {BG_COLORS.map((bg) => (
                    <button
                      key={bg.value}
                      className={`w-5 h-5 rounded-full border-2 ${backgroundColor === bg.value ? "border-white" : "border-transparent"}`}
                      style={{ backgroundColor: bg.value }}
                      onClick={() => setBackgroundColor(bg.value)}
                      title={bg.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            
            {isVoiceEnabled ? (
              <button
                onClick={onToggleMute}
                className={`p-2 sm:p-2.5 rounded-lg transition-colors ${isMuted ? "bg-red-500/30 text-red-400" : "bg-green-500/30 text-green-400"}`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            ) : (
              <button
                onClick={onJoinVoice}
                className="p-2 sm:p-2.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Join Voice Chat"
              >
                <MicOff className="w-4 h-4 sm:w-5 sm:h-5 opacity-50" />
              </button>
            )}
            
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            <button
              onClick={onReset}
              className="p-2 sm:p-2.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors"
              title="Reset Puzzle"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Right: victory banner */}
      <div className="pointer-events-auto">
        {uniqueGroups === 1 && totalPieces > 1 && (
          <div className="bg-green-500/20 backdrop-blur-md border border-green-500/50 rounded-xl p-3 flex items-center gap-2 text-green-400 animate-bounce shadow-[0_0_20px_rgba(34,197,94,0.4)]">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">Puzzle Completed!</span>
          </div>
        )}
      </div>
    </div>
  );
}
