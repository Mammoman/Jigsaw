/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const PIECE_OPTIONS = [24, 30, 45, 55, 67, 80, 96, 107, 118, 125, 145, 154, 170, 180, 200, 225, 250, 300, 330, 370, 420, 450, 500];

export default function HomePage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [targetPieces, setTargetPieces] = useState(96);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleCreate = async () => {
    if (!imageFile) { setError("Please select an image first."); return; }
    setIsCreating(true);
    setError(null);
    try {
      const extFromName = imageFile.name.includes(".") ? imageFile.name.split(".").pop() : "";
      const fileExt = extFromName || imageFile.type.split("/")[1] || "jpeg";
      const fileName = `${Date.now()}.${fileExt.replace(/[^a-zA-Z0-9]/g, '')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("puzzle-images")
        .upload(fileName, imageFile, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("puzzle-images").getPublicUrl(uploadData.path);
      const publicUrl = urlData.publicUrl;

      const img = new Image();
      img.src = imagePreview!;
      await new Promise(r => { img.onload = r; });
      const aspectRatio = img.width / img.height;
      const cols = Math.max(2, Math.round(Math.sqrt(targetPieces * aspectRatio)));
      const rows = Math.max(2, Math.round(targetPieces / cols));

      const { data: puzzle, error: dbError } = await supabase.from("puzzles").insert({
        image_url: publicUrl,
        thumbnail_url: publicUrl,
        target_pieces: targetPieces,
        actual_rows: rows,
        actual_cols: cols,
        seed: Math.floor(Math.random() * 999999),
        aspect_ratio: aspectRatio,
        is_public: true,
      }).select().single();
      if (dbError) throw dbError;

      router.push(`/play/${puzzle.id}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#111] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <span className="text-lg font-bold tracking-tight">🧩 Jigsaw</span>
        <span className="text-xs text-white/30">Multiplayer puzzle builder</span>
      </nav>

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left: Upload */}
        <div className="flex-1 flex flex-col justify-center p-6 md:p-12 gap-6 border-r border-white/5">
          <div>
            <h1 className="text-2xl font-bold">Choose your image</h1>
            <p className="text-white/40 text-sm mt-1">Drop a photo, screenshot, or any image to turn into a puzzle.</p>
          </div>

          {/* Dropzone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-xl border transition-colors cursor-pointer overflow-hidden ${
              dragOver ? "border-white/60 bg-white/5" : "border-white/10 hover:border-white/25"
            }`}
            style={{ minHeight: 280 }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover absolute inset-0 opacity-60" />
                <div className="relative z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 backdrop-blur">
                  Click to replace image
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/30 p-10">
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
                </svg>
                <span className="text-sm">Drag & drop or click to browse</span>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Right: Settings + Create */}
        <div className="w-full md:w-80 flex flex-col justify-center p-6 md:p-12 gap-8">
          <div className="flex flex-col gap-2">
            <label htmlFor="pieces-select" className="text-xs font-semibold text-white/40 uppercase tracking-widest">
              Number of pieces
            </label>
            <select
              id="pieces-select"
              value={targetPieces}
              onChange={(e) => setTargetPieces(Number(e.target.value))}
              className="bg-[#1a1a1a] border border-white/10 text-white rounded-lg px-4 py-3 text-sm appearance-none cursor-pointer hover:border-white/25 transition-colors focus:outline-none focus:border-white/40"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ffffff60' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: "2.5rem" }}
            >
              {PIECE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} pieces</option>
              ))}
            </select>
            <p className="text-xs text-white/20">
              {targetPieces <= 55 ? "Great for beginners" : targetPieces <= 118 ? "Moderate challenge" : targetPieces <= 250 ? "Experienced puzzlers" : "Expert level"}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleCreate}
              disabled={!imageFile || isCreating}
              className="w-full py-3 rounded-lg font-semibold text-sm bg-white text-black hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create puzzle →"}
            </button>
            <p className="text-xs text-white/20 text-center leading-relaxed">
              You'll get a shareable link. Anyone with the link can join and solve it with you.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
