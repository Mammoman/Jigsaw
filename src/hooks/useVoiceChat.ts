import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export function useVoiceChat(roomId: string, myId: string) {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanupPeer = useCallback((peerId: string) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
      delete peersRef.current[peerId];
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback((peerId: string, initiator: boolean) => {
    cleanupPeer(peerId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[peerId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "WEBRTC_ICE",
          payload: { to: peerId, from: myId, candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStreams((prev) => ({
          ...prev,
          [peerId]: event.streams[0]
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        cleanupPeer(peerId);
      }
    };

    return pc;
  }, [cleanupPeer, myId]);

  const handleJoinVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setIsVoiceEnabled(true);
      setIsMuted(false);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "VOICE_JOIN",
          payload: { from: myId }
        });
      }
    } catch (err) {
      console.error("Failed to get microphone access:", err);
      alert("Microphone access is required for voice chat.");
    }
  }, [myId]);

  const handleLeaveVoice = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    Object.keys(peersRef.current).forEach(peerId => cleanupPeer(peerId));
    setIsVoiceEnabled(false);
    setIsMuted(false);
    
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "VOICE_LEAVE",
        payload: { from: myId }
      });
    }
  }, [cleanupPeer, myId]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  useEffect(() => {
    if (!roomId || roomId === "default" || !myId) return;

    const channel = supabase.channel(`voice-room:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "VOICE_JOIN" }, async ({ payload }) => {
        if (!isVoiceEnabled) return;
        const peerId = payload.from;
        const pc = createPeer(peerId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "WEBRTC_OFFER",
          payload: { to: peerId, from: myId, offer }
        });
      })
      .on("broadcast", { event: "VOICE_LEAVE" }, ({ payload }) => {
        cleanupPeer(payload.from);
      })
      .on("broadcast", { event: "WEBRTC_OFFER" }, async ({ payload }) => {
        if (!isVoiceEnabled || payload.to !== myId) return;
        const peerId = payload.from;
        const pc = createPeer(peerId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "WEBRTC_ANSWER",
          payload: { to: peerId, from: myId, answer }
        });
      })
      .on("broadcast", { event: "WEBRTC_ANSWER" }, async ({ payload }) => {
        if (!isVoiceEnabled || payload.to !== myId) return;
        const pc = peersRef.current[payload.from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      })
      .on("broadcast", { event: "WEBRTC_ICE" }, async ({ payload }) => {
        if (!isVoiceEnabled || payload.to !== myId) return;
        const pc = peersRef.current[payload.from];
        if (pc && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      Object.keys(peersRef.current).forEach(peerId => cleanupPeer(peerId));
    };
  }, [roomId, myId, isVoiceEnabled, createPeer, cleanupPeer]);

  // Clean up on unmount completely
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    isVoiceEnabled,
    isMuted,
    remoteStreams,
    handleJoinVoice,
    handleLeaveVoice,
    toggleMute
  };
}
