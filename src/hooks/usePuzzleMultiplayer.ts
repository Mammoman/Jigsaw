import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PiecePositions, usePuzzleStore } from "@/stores/usePuzzleStore";
import { PieceRuntimeState } from "@/types/puzzle";

const CHANNEL_PREFIX = "puzzle-room";
/** Minimum gap between streamed pointer/drag messages. */
const STREAM_INTERVAL_MS = 30;

type PresenceMeta = { userId: string; username: string; color: string };

/**
 * Peer-to-peer relay over Supabase Realtime. There is no authoritative server:
 * every client applies whatever it receives, so all position messages are
 * absolute (a dropped delta would otherwise leave clients permanently offset)
 * and new joiners ask the room for a full board snapshot.
 */
export function usePuzzleMultiplayer(roomId: string) {
  const username = usePuzzleStore((s) => s.username);

  const [myId] = useState(() => `user-${Math.random().toString(36).slice(2, 8)}`);
  const [myColor] = useState(() => `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastPointerSent = useRef(0);
  const lastDragSent = useRef(0);

  useEffect(() => {
    if (!roomId || roomId === "default") return;

    const {
      updateRemoteCursor,
      removeRemoteCursor,
      applyRemoteGroupPosition,
      applyGroupSnapshot,
      applyBoardSnapshot,
      resetBoard,
      setPlayerCount,
    } = usePuzzleStore.getState();

    const channel = supabase.channel(`${CHANNEL_PREFIX}:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "POINTER_MOVE" }, ({ payload }) => {
        updateRemoteCursor(payload.id, payload.x, payload.y, payload.color, payload.username);
      })
      .on("broadcast", { event: "GROUP_MOVE" }, ({ payload }) => {
        applyRemoteGroupPosition(payload.anchorId, payload.x, payload.y);
      })
      .on("broadcast", { event: "GROUP_MERGE" }, ({ payload }) => {
        applyGroupSnapshot(payload.groupId, payload.positions);
      })
      .on("broadcast", { event: "SYNC_REQ" }, () => {
        // A peer just joined; anyone with a board hands over a copy.
        const { pieces, renderOrder } = usePuzzleStore.getState();
        if (Object.keys(pieces).length === 0) return;
        channel.send({ type: "broadcast", event: "SYNC_STATE", payload: { pieces, renderOrder } });
      })
      .on("broadcast", { event: "SYNC_STATE" }, ({ payload }) => {
        applyBoardSnapshot(
          payload.pieces as Record<string, PieceRuntimeState>,
          payload.renderOrder as string[]
        );
      })
      .on("broadcast", { event: "RESET" }, () => {
        resetBoard();
      })
      // Presence: keep player count up to date
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPlayerCount(Object.keys(state).length);
      })
      .on<PresenceMeta>("presence", { event: "leave" }, ({ leftPresences }) => {
        leftPresences.forEach((p) => removeRemoteCursor(p.userId));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: myId,
            username: usePuzzleStore.getState().username || "Player",
            color: myColor,
          });
          channel.send({ type: "broadcast", event: "SYNC_REQ", payload: { id: myId } });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPlayerCount(0);
    };
  }, [roomId, myId, myColor]);

  // Re-track when the user sets their display name
  useEffect(() => {
    if (channelRef.current && username) {
      channelRef.current.track({ userId: myId, username, color: myColor });
    }
  }, [username, myId, myColor]);

  const sendPointerMove = useCallback(
    (x: number, y: number) => {
      const now = performance.now();
      if (now - lastPointerSent.current < STREAM_INTERVAL_MS) return;
      lastPointerSent.current = now;
      channelRef.current?.send({
        type: "broadcast",
        event: "POINTER_MOVE",
        payload: { id: myId, x, y, color: myColor, username: usePuzzleStore.getState().username },
      });
    },
    [myId, myColor]
  );

  /** Stream the absolute position of one piece in the dragged group. `force` bypasses throttling (use on drop). */
  const sendGroupMove = useCallback((anchorId: string, x: number, y: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastDragSent.current < STREAM_INTERVAL_MS) return;
    lastDragSent.current = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "GROUP_MOVE",
      payload: { anchorId, x, y },
    });
  }, []);

  /** After a local snap, publish the exact positions of the whole merged group. */
  const sendGroupMerge = useCallback((groupId: string, positions: PiecePositions) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "GROUP_MERGE",
      payload: { groupId, positions },
    });
  }, []);

  const sendReset = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "RESET", payload: {} });
  }, []);

  return { sendPointerMove, sendGroupMove, sendGroupMerge, sendReset, myColor };
}
