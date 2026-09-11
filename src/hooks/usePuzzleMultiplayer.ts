import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePuzzleStore } from "@/stores/usePuzzleStore";

const CHANNEL_PREFIX = "puzzle-room";

export function usePuzzleMultiplayer(roomId: string) {
  const {
    updateRemoteCursor,
    removeRemoteCursor,
    mergeGroups,
    applyRemoteDrag,
    username,
  } = usePuzzleStore();

  const myId = useRef<string>(`user-${Math.random().toString(36).slice(2, 8)}`).current;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!roomId || roomId === "default") return;

    const channel = supabase.channel(`${CHANNEL_PREFIX}:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "POINTER_MOVE" }, ({ payload }) => {
        updateRemoteCursor(payload.id, payload.x, payload.y, payload.color, payload.username);
      })
      .on("broadcast", { event: "DRAG_STREAM" }, ({ payload }) => {
        applyRemoteDrag(payload.groupId, payload.dx, payload.dy);
      })
      .on("broadcast", { event: "MERGE_NOTIFY" }, ({ payload }) => {
        mergeGroups(payload.groupIdToKeep, payload.groupIdToMerge, payload.snapDx, payload.snapDy);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        leftPresences.forEach((p: any) => removeRemoteCursor(p.userId));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId]);

  const sendPointerMove = (x: number, y: number, color: string, uname: string | null) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "POINTER_MOVE",
      payload: { id: myId, x, y, color, username: uname },
    });
  };

  const sendDragStream = (groupId: string, dx: number, dy: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "DRAG_STREAM",
      payload: { groupId, dx, dy },
    });
  };

  const sendMergeNotify = (groupIdToKeep: string, groupIdToMerge: string, snapDx: number, snapDy: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "MERGE_NOTIFY",
      payload: { groupIdToKeep, groupIdToMerge, snapDx, snapDy },
    });
  };

  return { sendPointerMove, sendDragStream, sendMergeNotify };
}
