import Stage from "@/components/canvas/Stage";
import TopNav from "@/components/hud/TopNav";
import Dock from "@/components/hud/Dock";
import RemoteCursors from "@/components/canvas/RemoteCursors";

export default function PlayPage() {
  const imageUrl = "https://images.unsplash.com/photo-1543508282-5c1f427f023f?q=80&w=1200&auto=format&fit=crop";

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#1e1e1e] relative">
      <TopNav />
      <RemoteCursors />
      <Stage imageUrl={imageUrl} targetPieces={24} />
      <Dock />
    </main>
  );
}
