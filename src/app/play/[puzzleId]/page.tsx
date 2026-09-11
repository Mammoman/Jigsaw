"use client";

import { useEffect, useState, use } from "react";
import Stage from "@/components/canvas/Stage";
import TopNav from "@/components/hud/TopNav";
import Dock from "@/components/hud/Dock";
import RemoteCursors from "@/components/canvas/RemoteCursors";
import { usePuzzleStore } from "@/stores/usePuzzleStore";
import { supabase } from "@/lib/supabase/client";

export default function PlayPage({ params }: { params: Promise<{ puzzleId: string }> }) {
  const { puzzleId } = use(params);
  
  const { loadSavedGame, clearSavedGame, setPuzzleId, username, setUsername } = usePuzzleStore();
  const [shouldLoad, setShouldLoad] = useState<boolean | null>(null);
  const [puzzleMetadata, setPuzzleMetadata] = useState<any>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [tempName, setTempName] = useState("");

  useEffect(() => {
    const fetchPuzzle = async () => {
      const { data, error } = await supabase.from("puzzles").select("*").eq("id", puzzleId).single();
      if (error || !data) {
        alert("Puzzle not found!");
        return;
      }
      setPuzzleMetadata(data);
    };
    fetchPuzzle();
  }, [puzzleId]);

  useEffect(() => {
    setPuzzleId(puzzleId);
    
    if (!username) {
      setShowUsernameModal(true);
    }
    
    import("idb-keyval").then(({ get }) => {
      get(`puzzle-${puzzleId}`).then((saved) => {
        if (saved) {
          const restore = window.confirm("You have an unfinished puzzle. Would you like to resume?");
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

  if (!shouldLoad || !puzzleMetadata) {
    return <div className="w-screen h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#1e1e1e] relative">
      {showUsernameModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleJoin} className="bg-[#2a2a2a] p-8 rounded-2xl shadow-2xl flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-white">Enter your name to join</h2>
            <input 
              autoFocus
              type="text" 
              className="px-4 py-2 rounded bg-black/50 text-white border border-white/20 outline-none focus:border-blue-500" 
              placeholder="Your name..."
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition-colors">
              Join Game
            </button>
          </form>
        </div>
      )}
      <TopNav />
      <div className="absolute top-16 right-3 z-10 w-24 sm:w-36 md:w-48 rounded-lg shadow-2xl border-2 border-[#2a2a2a] overflow-hidden pointer-events-none opacity-70 hover:opacity-100 transition-opacity">
        <img src={puzzleMetadata.image_url} alt="Reference Image" className="w-full h-auto" />
      </div>
      <RemoteCursors />
      <Stage imageUrl={puzzleMetadata.image_url} targetPieces={puzzleMetadata.target_pieces} />
      <Dock />
    </main>
  );
}
