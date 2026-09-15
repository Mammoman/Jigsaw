"use client";

import { useEffect, useState, use, useCallback } from "react";
import Stage from "@/components/canvas/Stage";
import TopNav from "@/components/hud/TopNav";
import Dock from "@/components/hud/Dock";
import RemoteCursors from "@/components/canvas/RemoteCursors";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { usePuzzleMultiplayer } from "@/hooks/usePuzzleMultiplayer";
import { supabase } from "@/lib/supabase/client";

export default function PlayPage({ params }: { params: Promise<{ puzzleId: string }> }) {
  const { puzzleId } = use(params);

  const { loadSavedGame, clearSavedGame, setPuzzleId, username, setUsername, playerCount } =
    usePuzzleStore();

  const { sendPointerMove, sendDragStream, sendMergeNotify, myColor } =
    usePuzzleMultiplayer(puzzleId);

  const [shouldLoad, setShouldLoad] = useState<boolean | null>(null);
  const [puzzleMetadata, setPuzzleMetadata] = useState<any>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [copied, setCopied] = useState(false);

  // Fetch puzzle metadata from Supabase
  useEffect(() => {
    const fetchPuzzle = async () => {
      const { data, error } = await supabase
        .from("puzzles")
        .select("*")
        .eq("id", puzzleId)
        .single();
      if (error || !data) {
        alert("Puzzle not found!");
        return;
      }
      setPuzzleMetadata(data);
    };
    fetchPuzzle();
  }, [puzzleId]);

  // Set puzzleId, prompt for username, check for saved game
  useEffect(() => {
    setPuzzleId(puzzleId);

    if (!username) {
      setShowUsernameModal(true);
    }

    import("idb-keyval").then(({ get }) => {
      get(`puzzle-${puzzleId}`).then((saved) => {
        if (saved) {
          const restore = window.confirm(
            "You have an unfinished puzzle. Would you like to resume?"
          );
          if (restore) {
            loadSavedGame(puzzleId).then(() => setShouldLoad(true));
          } else {
            clearSavedGame(puzzleId).then(() => setShouldLoad(true));
          }
        } else {
          setShouldLoad(true);
        }
      });
    });
  }, [puzzleId, setPuzzleId, loadSavedGame, clearSavedGame, username]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setUsername(tempName.trim());
      setShowUsernameModal(false);
    }
  };

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // ── Loading state ──────────────────────────────────────────────
  if (!shouldLoad || !puzzleMetadata) {
    return (
      <div className="w-screen h-[100dvh] bg-[#111] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/40 text-sm">Loading puzzle…</span>
        </div>
      </div>
    );
  }

  // ── Lobby: waiting for second player ──────────────────────────
  const isGameReady = playerCount >= 2;

  return (
    <main className="w-screen h-[100dvh] overflow-hidden bg-[#111] relative">
      {/* Username modal — shown before lobby */}
      {showUsernameModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <form
            onSubmit={handleJoin}
            className="bg-[#1a1a1a] border border-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl flex flex-col gap-5 w-full max-w-sm"
          >
            <div>
              <h2 className="text-xl font-bold text-white">What's your name?</h2>
              <p className="text-white/40 text-sm mt-1">
                Other players will see this above your cursor.
              </p>
            </div>
            <input
              autoFocus
              type="text"
              className="px-4 py-2.5 rounded-lg bg-black/50 text-white border border-white/15 outline-none focus:border-white/40 transition-colors placeholder:text-white/25"
              placeholder="Your name…"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
            />
            <button
              type="submit"
              disabled={!tempName.trim()}
              className="bg-white text-black font-semibold py-2.5 rounded-lg hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-30"
            >
              Join →
            </button>
          </form>
        </div>
      )}

      {/* Lobby overlay — shown until both players are present */}
      {!isGameReady && !showUsernameModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#111]">
          <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
            {/* Puzzle thumbnail */}
            {puzzleMetadata?.image_url && (
              <div className="w-32 h-32 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img
                  src={puzzleMetadata.image_url}
                  alt="Puzzle"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Waiting indicator */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <h1 className="text-xl font-bold text-white">Waiting for another player…</h1>
              <p className="text-white/40 text-sm leading-relaxed">
                The puzzle starts as soon as someone else joins. Share the link below.
              </p>
            </div>

            {/* Player count pill */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-5 py-2">
              <div className="flex gap-1">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
                      i < playerCount ? "bg-green-400" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
              <span className="text-white/60 text-sm font-medium">
                {playerCount} / 2 players
              </span>
            </div>

            {/* Copy link */}
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={handleCopyLink}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all border ${
                  copied
                    ? "bg-green-500/15 border-green-500/40 text-green-400"
                    : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20"
                }`}
              >
                {copied ? "✓ Link copied!" : "📋 Copy invite link"}
              </button>
              <p className="text-white/20 text-xs text-center">
                Anyone with this link can join and solve with you
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Game UI — always rendered once shouldLoad is true, but visually hidden until ready */}
      {isGameReady && (
        <>
          <TopNav />
          <div className="absolute top-16 right-3 z-10 w-24 sm:w-36 md:w-48 rounded-lg shadow-2xl border-2 border-[#2a2a2a] overflow-hidden pointer-events-none opacity-70 hover:opacity-100 transition-opacity">
            <img
              src={puzzleMetadata.image_url}
              alt="Reference"
              className="w-full h-auto"
            />
          </div>
          <RemoteCursors />
          <Stage
            imageUrl={puzzleMetadata.image_url}
            targetPieces={puzzleMetadata.target_pieces}
            sendPointerMove={sendPointerMove}
            sendDragStream={sendDragStream}
            sendMergeNotify={sendMergeNotify}
            myColor={myColor}
          />
          <Dock />
        </>
      )}
    </main>
  );
}
