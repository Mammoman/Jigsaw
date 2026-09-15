"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { Clock, CheckCircle2, Share2, Check } from "lucide-react";

export default function TopNav() {
  const pieces = usePuzzleStore((s) => s.pieces);
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
  const progress = totalPieces === 0 || totalPieces === 1 ? 0 : Math.round((connected / (totalPieces - 1)) * 100);

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

  return (
    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-10">
      {/* Left: timer + progress */}
      <div className="bg-black/60 backdrop-blur-md rounded-xl p-3 flex items-center gap-4 text-white pointer-events-auto border border-white/10 shadow-xl">
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
      </div>

      {/* Right: victory banner */}
      {uniqueGroups === 1 && totalPieces > 1 && (
        <div className="bg-green-500/20 backdrop-blur-md border border-green-500/50 rounded-xl p-3 flex items-center gap-2 text-green-400 pointer-events-auto animate-bounce shadow-[0_0_20px_rgba(34,197,94,0.4)]">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-semibold">Puzzle Completed!</span>
        </div>
      )}
    </div>
  );
}
