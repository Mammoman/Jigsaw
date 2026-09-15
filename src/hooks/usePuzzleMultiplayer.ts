import { useEffect, useRef, useState } from "react";
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
    setPlayerCount,
  } = usePuzzleStore();

  const [myId] = useState(() => `user-${Math.random().toString(36).slice(2, 8)}`);
  const [myColor] = useState(() => `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`);
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
      // Presence: keep player count up to date
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPlayerCount(Object.keys(state).length);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leftPresences.forEach((p: any) => removeRemoteCursor(p.userId));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: myId,
            username: username || "Player",
            color: myColor,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPlayerCount(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Re-track when the user sets their display name
  useEffect(() => {
    if (channelRef.current && username) {
      channelRef.current.track({ userId: myId, username, color: myColor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

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

  const sendMergeNotify = (
    groupIdToKeep: string,
    groupIdToMerge: string,
    snapDx: number,
    snapDy: number
  ) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "MERGE_NOTIFY",
      payload: { groupIdToKeep, groupIdToMerge, snapDx, snapDy },
    });
  };

  return { sendPointerMove, sendDragStream, sendMergeNotify, myColor };
}
