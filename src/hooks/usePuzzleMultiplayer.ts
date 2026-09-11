import usePartySocket from "partysocket/react";
import { usePuzzleStore } from "@/stores/usePuzzleStore";

export function usePuzzleMultiplayer(roomId: string) {
  const {
    updateRemoteCursor,
    removeRemoteCursor,
    mergeGroups,
    applyRemoteDrag
  } = usePuzzleStore();

  const socket = usePartySocket({
    // We default to the local PartyKit server if no env var is provided
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
    room: roomId,
    onMessage(e) {
      const data = JSON.parse(e.data);
      if (data.type === "POINTER_MOVE") {
        updateRemoteCursor(data.payload.id, data.payload.x, data.payload.y, data.payload.color);
      } else if (data.type === "PEER_LEFT") {
        removeRemoteCursor(data.payload.id);
      } else if (data.type === "DRAG_STREAM") {
        applyRemoteDrag(data.payload.groupId, data.payload.dx, data.payload.dy);
      } else if (data.type === "MERGE_NOTIFY") {
        mergeGroups(data.payload.groupIdToKeep, data.payload.groupIdToMerge, data.payload.snapDx, data.payload.snapDy);
      }
    }
  });

  const sendPointerMove = (x: number, y: number, color: string) => {
    socket.send(JSON.stringify({ type: "POINTER_MOVE", payload: { id: socket.id, x, y, color } }));
  };

  const sendDragStream = (groupId: string, dx: number, dy: number) => {
    socket.send(JSON.stringify({ type: "DRAG_STREAM", payload: { groupId, dx, dy } }));
  };

  const sendMergeNotify = (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => {
    socket.send(JSON.stringify({ type: "MERGE_NOTIFY", payload: { groupIdToKeep, groupIdToMerge, snapDx, snapDy } }));
  };

  return { sendPointerMove, sendDragStream, sendMergeNotify };
}
