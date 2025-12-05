import { useEffect, useState, useRef } from "react";

export interface AudioStreamData {
  dataArray: Uint8Array<ArrayBuffer>;
  analyser: AnalyserNode;
}

export function useAudioStreams(
  localStream: MediaStream | null,
  remoteStream: MediaStream | null
) {
  const [localData, setLocalData] = useState<AudioStreamData | null>(null);
  const [remoteData, setRemoteData] = useState<AudioStreamData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const remoteSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    const setupStreams = async () => {
      // Clean up if no streams
      if (!localStream && !remoteStream) {
        if (audioContextRef.current) {
          await audioContextRef.current.close();
          audioContextRef.current = null;
        }
        setLocalData(null);
        setRemoteData(null);
        localSourceRef.current = null;
        remoteSourceRef.current = null;
        return;
      }

      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;

      // Setup for local stream
      if (localStream && localStream.getAudioTracks().length > 0) {
        try {
          const localAnalyser = audioContext.createAnalyser();
          localAnalyser.fftSize = 2048;
          localAnalyser.smoothingTimeConstant = 0.8;

          const localSource = audioContext.createMediaStreamSource(localStream);
          localSource.connect(localAnalyser);
          localSourceRef.current = localSource;

          const localDataArray = new Uint8Array(localAnalyser.frequencyBinCount);
          setLocalData({ dataArray: localDataArray, analyser: localAnalyser });
        } catch (error) {
          console.error("[useAudioStreams] Failed to setup local stream:", error);
        }
      } else {
        setLocalData(null);
      }

      // Setup for remote stream
      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        try {
          const remoteAnalyser = audioContext.createAnalyser();
          remoteAnalyser.fftSize = 2048;
          remoteAnalyser.smoothingTimeConstant = 0.8;

          const remoteSource = audioContext.createMediaStreamSource(remoteStream);
          remoteSource.connect(remoteAnalyser);
          remoteSourceRef.current = remoteSource;

          const remoteDataArray = new Uint8Array(remoteAnalyser.frequencyBinCount);
          setRemoteData({ dataArray: remoteDataArray, analyser: remoteAnalyser });
        } catch (error) {
          console.error("[useAudioStreams] Failed to setup remote stream:", error);
        }
      } else {
        setRemoteData(null);
      }
    };

    setupStreams();

    // Cleanup on unmount or stream change
    return () => {
      if (localSourceRef.current) {
        localSourceRef.current.disconnect();
        localSourceRef.current = null;
      }
      if (remoteSourceRef.current) {
        remoteSourceRef.current.disconnect();
        remoteSourceRef.current = null;
      }
    };
  }, [localStream, remoteStream]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  return { localData, remoteData };
}
