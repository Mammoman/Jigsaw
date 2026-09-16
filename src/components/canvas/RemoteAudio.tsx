"use client";

import React, { useEffect, useRef } from "react";

interface RemoteAudioProps {
  streams: Record<string, MediaStream>;
}

export default function RemoteAudio({ streams }: RemoteAudioProps) {
  return (
    <>
      {Object.entries(streams).map(([peerId, stream]) => (
        <AudioStream key={peerId} stream={stream} />
      ))}
    </>
  );
}

function AudioStream({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
