/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Stage from "@/components/canvas/Stage";
import TopNav from "@/components/hud/TopNav";
import Dock from "@/components/hud/Dock";
import RemoteCursors from "@/components/canvas/RemoteCursors";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { usePuzzleMultiplayer } from "@/hooks/usePuzzleMultiplayer";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { supabase } from "@/lib/supabase/client";
import { computeGrid } from "@/utils/boardGenerator";
import RemoteAudio from "@/components/canvas/RemoteAudio";

interface PuzzleRow {
  id: string;
  image_url: string;
  target_pieces: number;
  actual_rows: number | null;
  actual_cols: number | null;
  seed: number | string;
  aspect_ratio: number;
}

export default function PlayPage({ params }: PageProps<"/play/[puzzleId]">) {
  const { puzzleId } = use(params);

  const username = usePuzzleStore((s) => s.username);
  const playerCount = usePuzzleStore((s) => s.playerCount);
  const setUsername = usePuzzleStore((s) => s.setUsername);
  const backgroundColor = usePuzzleStore((s) => s.backgroundColor);

  const { sendPointerMove, sendGroupMove, sendGroupMerge, sendReset } =
    usePuzzleMultiplayer(puzzleId);

  const [saveChecked, setSaveChecked] = useState(false);
  const [puzzle, setPuzzle] = useState<PuzzleRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tempName, setTempName] = useState("");
  const [copied, setCopied] = useState(false);
  const searchParams = useSearchParams();
  const isSinglePlayer = searchParams.get("players") === "1";
  const [hasStarted, setHasStarted] = useState(isSinglePlayer);
  
  // Initialize voice chat
  const myId = usePuzzleStore((s) => s.username) || "unknown"; // actually myId should be consistent, maybe better pass it from somewhere?
  // Wait, in usePuzzleMultiplayer it generates myId. I should just use `username` as id or let useVoiceChat generate it? Let's just pass puzzleId to useVoiceChat and generate myId inside useVoiceChat or pass it from here.
  const { isVoiceEnabled, isMuted, remoteStreams, handleJoinVoice, handleLeaveVoice, toggleMute } = useVoiceChat(puzzleId, username || "guest");

  // Fetch puzzle metadata from Supabase
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("puzzles")
      .select("id,image_url,target_pieces,actual_rows,actual_cols,seed,aspect_ratio")
      .eq("id", puzzleId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        setPuzzle(data as PuzzleRow);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Bind the store to this puzzle and offer to resume a local save (once).
  useEffect(() => {
    const { setPuzzleId, loadSavedGame, clearSavedGame } = usePuzzleStore.getState();
    setPuzzleId(puzzleId);

    let cancelled = false;
    import("idb-keyval").then(({ get }) =>
      get(`puzzle-${puzzleId}`).then(async (saved) => {
        if (cancelled) return;
        // If a peer already handed us the live board, the local save is stale.
        if (saved && !usePuzzleStore.getState().remoteSynced) {
          if (window.confirm("You have an unfinished puzzle. Would you like to resume?")) {
            await loadSavedGame(puzzleId);
          } else {
            await clearSavedGame(puzzleId);
          }
        }
        if (!cancelled) setSaveChecked(true);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Latch on the first time a second player shows up (render-time state adjustment, per React docs).
  if (playerCount >= 2 && !hasStarted) setHasStarted(true);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setUsername(tempName.trim());
    }
  };

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleReset = useCallback(() => {
    if (!window.confirm("Scatter all pieces and start over for everyone in this room?")) return;
    usePuzzleStore.getState().resetBoard();
    sendReset();
  }, [sendReset]);

  // ── Not found ──────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="w-screen h-[100dvh] bg-[#111] flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-bold text-white">Puzzle not found</h1>
          <p className="text-white/40 text-sm">This link may be wrong or the puzzle was removed.</p>
          <Link
            href="/"
            className="mt-2 bg-white text-black font-semibold py-2.5 px-5 rounded-lg hover:bg-white/90 transition-colors text-sm"
          >
            Create a new puzzle
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────
  if (!saveChecked || !puzzle) {
    return (
      <div className="w-screen h-[100dvh] bg-[#111] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/40 text-sm">Loading puzzle…</span>
        </div>
      </div>
    );
  }

  const grid =
    puzzle.actual_rows && puzzle.actual_cols
      ? { rows: puzzle.actual_rows, cols: puzzle.actual_cols }
      : computeGrid(puzzle.target_pieces, puzzle.aspect_ratio);
  const seed = Number(puzzle.seed) || 42;
  const showUsernameModal = !username;

  return (
    <main className="w-screen h-[100dvh] overflow-hidden relative" style={{ backgroundColor }}>
      {/* Texture Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20 mix-blend-multiply"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Username modal — shown before lobby */}
      {showUsernameModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <form
            onSubmit={handleJoin}
            className="bg-[#1a1a1a] border border-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl flex flex-col gap-5 w-full max-w-sm"
          >
            <div>
              <h2 className="text-xl font-bold text-white">What&apos;s your name?</h2>
              <p className="text-white/40 text-sm mt-1">
                Other players will see this above your cursor.
              </p>
            </div>
            <input
              autoFocus
              type="text"
              maxLength={24}
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

      {/* Lobby overlay — shown until a second player arrives or the host starts solo */}
      {!hasStarted && !showUsernameModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#111]">
          <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <img src={puzzle.image_url} alt="Puzzle" className="w-full h-full object-cover" />
            </div>

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
              <span className="text-white/60 text-sm font-medium">{playerCount} / 2 players</span>
            </div>

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
              <button
                onClick={() => setHasStarted(true)}
                className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white transition-colors"
              >
                Start without waiting
              </button>
              <p className="text-white/20 text-xs text-center">
                Anyone with this link can join and solve with you
              </p>
            </div>
          </div>
        </div>
      )}

      {hasStarted && (
        <>
          <TopNav />
          <div className="absolute top-16 right-3 z-10 w-24 sm:w-36 md:w-48 rounded-lg shadow-2xl border-2 border-[#2a2a2a] overflow-hidden pointer-events-none opacity-70 hover:opacity-100 transition-opacity">
            <img src={puzzle.image_url} alt="Reference" className="w-full h-auto" />
          </div>
          <RemoteCursors />
          <Stage
            imageUrl={puzzle.image_url}
            seed={seed}
            rows={grid.rows}
            cols={grid.cols}
            sendPointerMove={sendPointerMove}
            sendGroupMove={sendGroupMove}
            sendGroupMerge={sendGroupMerge}
          />
          <Dock 
            onReset={handleReset} 
            isVoiceEnabled={isVoiceEnabled}
            isMuted={isMuted}
            onJoinVoice={handleJoinVoice}
            onToggleMute={toggleMute}
          />
          <RemoteAudio streams={remoteStreams} />
        </>
      )}
    </main>
  );
}
