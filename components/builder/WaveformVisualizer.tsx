"use client";

import { useRef, useEffect, useState } from "react";
import { useAudioStreams } from "./hooks/useAudioStreams";
import type { JitterStats } from "./SipPhone";

interface WaveformVisualizerProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  jitterStats?: JitterStats | null;
  isActive: boolean;
  height?: number; // Height in pixels (default: 80)
}

export function WaveformVisualizer({
  localStream,
  remoteStream,
  jitterStats = null,
  isActive,
  height = 80,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jitterCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const jitterContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const { localData, remoteData } = useAudioStreams(localStream, remoteStream);

  // Store accumulated waveform samples and RMS energy levels
  const localSamplesRef = useRef<number[]>([]);
  const remoteSamplesRef = useRef<number[]>([]);
  const localRMSRef = useRef<number[]>([]); // RMS energy for silence detection
  const remoteRMSRef = useRef<number[]>([]); // RMS energy for silence detection
  const localJitterRef = useRef<number[]>([]); // WebRTC jitter values (in milliseconds)
  const remoteJitterRef = useRef<number[]>([]); // WebRTC jitter values (in milliseconds)
  const localPacketLossRef = useRef<number[]>([]); // WebRTC packet loss percentage
  const remotePacketLossRef = useRef<number[]>([]); // WebRTC packet loss percentage
  const scrollOffsetRef = useRef<number>(0);
  const lastSampleTimeRef = useRef<number>(0);
  const lastJitterTimestampRef = useRef<number>(0);

  const [currentCodec, setCurrentCodec] = useState<string>('');
  const [currentMOS, setCurrentMOS] = useState<number | null>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [silenceStats, setSilenceStats] = useState<{
    avgSilence: number;
    maxSilence: number;
    initialSilence: number;
    avgAgentTalk: number;
    maxAgentTalk: number;
  } | null>(null);

  // Track if we've had streams before to know when a new call starts
  const hadStreamsRef = useRef(false);
  const callStartTimeRef = useRef<number | null>(null);
  const firstVoiceTimeRef = useRef<number | null>(null);
  const baseContainerWidthRef = useRef<number | null>(null);

  // Clear samples only when a new call starts (streams go from null to active)
  useEffect(() => {
    const hasStreams = localStream !== null || remoteStream !== null;

    // Only clear when new streams are provided after having no streams
    // This preserves the waveform after a call ends
    if (hasStreams && !hadStreamsRef.current) {
      localSamplesRef.current = [];
      remoteSamplesRef.current = [];
      localRMSRef.current = [];
      remoteRMSRef.current = [];
      localJitterRef.current = [];
      remoteJitterRef.current = [];
      localPacketLossRef.current = [];
      remotePacketLossRef.current = [];
      scrollOffsetRef.current = 0;
      lastSampleTimeRef.current = 0;
      callStartTimeRef.current = performance.now();
      firstVoiceTimeRef.current = null;
      // Don't reset baseContainerWidthRef - keep using the same viewport width
    }

    hadStreamsRef.current = hasStreams;
  }, [localStream, remoteStream]);

  // Separate effect for audio sampling - runs always when streams exist
  useEffect(() => {
    if (!localData && !remoteData) return;

    const SAMPLE_INTERVAL_MS = 50; // Sample audio every 50ms for smooth visualization
    const SILENCE_THRESHOLD = 3.0; // RMS energy threshold (must match draw loop)
    let lastSampleTime = performance.now();

    const sampleAudio = () => {
      const currentTime = performance.now();

      // Only add samples at fixed intervals (not every frame) to control time scaling
      if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
        lastSampleTime = currentTime;
        lastSampleTimeRef.current = currentTime;

        let localRMS = 0;
        let remoteRMS = 0;

        // Accumulate new sample from local stream
        if (localData) {
          localData.analyser.getByteTimeDomainData(localData.dataArray);
          // Calculate simple average for waveform display
          let sum = 0;
          let sumSquares = 0;
          for (let i = 0; i < localData.dataArray.length; i++) {
            sum += localData.dataArray[i];
            const deviation = localData.dataArray[i] - 128;
            sumSquares += deviation * deviation;
          }
          localSamplesRef.current.push(sum / localData.dataArray.length);
          // Calculate RMS energy for silence detection
          localRMS = Math.sqrt(sumSquares / localData.dataArray.length);
          localRMSRef.current.push(localRMS);

        }

        // Accumulate new sample from remote stream
        if (remoteData) {
          remoteData.analyser.getByteTimeDomainData(remoteData.dataArray);
          // Calculate simple average for waveform display
          let sum = 0;
          let sumSquares = 0;
          for (let i = 0; i < remoteData.dataArray.length; i++) {
            sum += remoteData.dataArray[i];
            const deviation = remoteData.dataArray[i] - 128;
            sumSquares += deviation * deviation;
          }
          remoteSamplesRef.current.push(sum / remoteData.dataArray.length);
          // Calculate RMS energy for silence detection
          remoteRMS = Math.sqrt(sumSquares / remoteData.dataArray.length);
          remoteRMSRef.current.push(remoteRMS);
        }

        // Track first voice activity for initial silence calculation
        if (firstVoiceTimeRef.current === null && callStartTimeRef.current !== null) {
          const hasVoice = localRMS >= SILENCE_THRESHOLD || remoteRMS >= SILENCE_THRESHOLD;
          if (hasVoice) {
            firstVoiceTimeRef.current = currentTime;
          }
        }
      }

      samplingLoopId = requestAnimationFrame(sampleAudio);
    };

    let samplingLoopId = requestAnimationFrame(sampleAudio);

    return () => {
      if (samplingLoopId) {
        cancelAnimationFrame(samplingLoopId);
      }
    };
  }, [localData, remoteData]);

  // Separate effect for processing WebRTC jitter stats
  useEffect(() => {
    if (!jitterStats) return;

    // Only process if we have a new jitter update (based on timestamp)
    if (jitterStats.timestamp === lastJitterTimestampRef.current) return;
    lastJitterTimestampRef.current = jitterStats.timestamp;

    // Update codec and MOS display
    setCurrentCodec(jitterStats.codec);
    setCurrentMOS(jitterStats.mos);

    // Convert WebRTC jitter from seconds to milliseconds for visualization
    // WebRTC jitter is typically a very small number (< 0.1 seconds)
    const localJitterMs = jitterStats.localJitter * 1000;
    const remoteJitterMs = jitterStats.remoteJitter * 1000;

    // Append the jitter and packet loss values to match the timing of audio samples
    // Jitter comes in at ~100ms intervals, we sample audio at 50ms
    // So we'll add 2 copies of each value to align with audio samples
    localJitterRef.current.push(localJitterMs, localJitterMs);
    remoteJitterRef.current.push(remoteJitterMs, remoteJitterMs);
    localPacketLossRef.current.push(jitterStats.localPacketLoss, jitterStats.localPacketLoss);
    remotePacketLossRef.current.push(jitterStats.remotePacketLoss, jitterStats.remotePacketLoss);

    // Keep arrays in sync with audio sample arrays
    const maxSamples = Math.max(localSamplesRef.current.length, remoteSamplesRef.current.length);
    while (localJitterRef.current.length > maxSamples) {
      localJitterRef.current.shift();
    }
    while (remoteJitterRef.current.length > maxSamples) {
      remoteJitterRef.current.shift();
    }
    while (localPacketLossRef.current.length > maxSamples) {
      localPacketLossRef.current.shift();
    }
    while (remotePacketLossRef.current.length > maxSamples) {
      remotePacketLossRef.current.shift();
    }
  }, [jitterStats]);

  // Separate effect for rendering - only runs when tab is active
  useEffect(() => {
    if (!isActive || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match display size and capture base width
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.height = rect.height * window.devicePixelRatio;
      // Capture the container width once when component mounts or resizes
      // This width stays constant even when scrollbars appear
      baseContainerWidthRef.current = container.offsetWidth;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Configuration: 60 seconds should fill approximately the screen width
    const TARGET_SECONDS_PER_SCREEN = 60;
    const SAMPLE_INTERVAL_MS = 50; // Must match sampling interval

    const draw = () => {
      if (!canvasRef.current || !ctx || !containerRef.current) return;

      const height = canvasRef.current.height / window.devicePixelRatio;

      // Use the base container width captured at mount/resize
      const containerWidth = baseContainerWidthRef.current!;
      const PIXELS_PER_SECOND = containerWidth / TARGET_SECONDS_PER_SCREEN; // ~20 pixels/second for 1200px screen

      // Calculate canvas width based on time duration
      // Each sample represents SAMPLE_INTERVAL_MS milliseconds
      const maxSamples = Math.max(localSamplesRef.current.length, remoteSamplesRef.current.length);
      const durationSeconds = (maxSamples * SAMPLE_INTERVAL_MS) / 1000;
      const neededWidth = Math.max(
        durationSeconds * PIXELS_PER_SECOND,
        containerWidth
      );

      const scaledWidth = neededWidth * window.devicePixelRatio;

      // Always reset transform to ensure consistent scaling
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Update canvas drawing buffer size if needed
      if (canvas.width !== scaledWidth) {
        canvas.width = scaledWidth;
      }

      // Always update CSS width to actual pixel width for proper scrolling
      canvas.style.width = `${neededWidth}px`;

      const width = neededWidth;
      const pixelsPerSample = (SAMPLE_INTERVAL_MS / 1000) * PIXELS_PER_SECOND;

      // Auto-scroll to end
      if (autoScroll) {
        scrollOffsetRef.current = Math.max(0, width - containerWidth);
        container.scrollLeft = scrollOffsetRef.current;
      }

      // Clear canvas with default dark background
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(0, 0, width, height);

      // Draw silence detection background (red where both channels were silent)
      // Using RMS (Root Mean Square) energy for more reliable silence detection
      const SILENCE_THRESHOLD = 3.0; // RMS energy threshold (adjust as needed)
      const MIN_SILENCE_DURATION_MS = 500; // Minimum duration to count as continuous silence
      const MIN_SILENCE_SAMPLES = Math.ceil(MIN_SILENCE_DURATION_MS / SAMPLE_INTERVAL_MS); // ~10 samples at 50ms
      const LOOKBACK_SAMPLES = 5; // How many samples to look back/forward to determine speaker

      // Helper function to determine who was speaking in a range
      const getActiveSpeaker = (startIdx: number, endIdx: number): 'local' | 'remote' | 'both' | 'none' => {
        let localActive = false;
        let remoteActive = false;

        for (let i = startIdx; i <= endIdx && i < maxSamples && i >= 0; i++) {
          const localRMS = localRMSRef.current[i] ?? 0;
          const remoteRMS = remoteRMSRef.current[i] ?? 0;

          if (localRMS >= SILENCE_THRESHOLD) localActive = true;
          if (remoteRMS >= SILENCE_THRESHOLD) remoteActive = true;

          if (localActive && remoteActive) break; // Both found
        }

        if (localActive && remoteActive) return 'both';
        if (localActive) return 'local';
        if (remoteActive) return 'remote';
        return 'none';
      };

      // First pass: identify silence periods with minimum duration
      interface SilencePeriod {
        startIndex: number;
        endIndex: number;
        durationMs: number;
        isUserToAgent: boolean; // true if user spoke before and agent after (measure response time)
      }
      const silencePeriods: SilencePeriod[] = [];

      for (let i = 0; i < maxSamples; i++) {
        const localRMS = localRMSRef.current[i] ?? 0;
        const remoteRMS = remoteRMSRef.current[i] ?? 0;
        const bothSilent = localRMS < SILENCE_THRESHOLD && remoteRMS < SILENCE_THRESHOLD;

        if (bothSilent) {
          // Check if this is part of a continuous silence period
          let silenceCount = 1;
          // Look ahead to count consecutive silence samples
          for (let j = i + 1; j < maxSamples; j++) {
            const localRMSNext = localRMSRef.current[j] ?? 0;
            const remoteRMSNext = remoteRMSRef.current[j] ?? 0;
            if (localRMSNext < SILENCE_THRESHOLD && remoteRMSNext < SILENCE_THRESHOLD) {
              silenceCount++;
            } else {
              break;
            }
          }

          // If this silence period is long enough, check if it's a conversational gap
          if (silenceCount >= MIN_SILENCE_SAMPLES) {
            // Look back to see who was speaking before the silence
            const speakerBefore = getActiveSpeaker(
              Math.max(0, i - LOOKBACK_SAMPLES),
              i - 1
            );

            // Look ahead to see who speaks after the silence
            const speakerAfter = getActiveSpeaker(
              i + silenceCount,
              Math.min(maxSamples - 1, i + silenceCount + LOOKBACK_SAMPLES)
            );

            // Only highlight if:
            // 1. Different speakers before and after (turn-taking), OR
            // 2. No one speaking before or after (true conversational silence)
            // Don't highlight if same speaker continues (pause within speech)
            const isTurnChange = speakerBefore !== speakerAfter;
            const isConversationalGap = speakerBefore === 'none' || speakerAfter === 'none';
            const isSameSpeakerContinuing = speakerBefore === speakerAfter && speakerBefore !== 'none' && speakerBefore !== 'both';

            if ((isTurnChange || isConversationalGap) && !isSameSpeakerContinuing) {
              const durationMs = silenceCount * SAMPLE_INTERVAL_MS;
              // Check if this is user → agent transition:
              // - Local (user) spoke before, AND
              // - Remote (agent) speaks after OR nobody has spoken yet (agent hasn't responded yet)
              // This ensures the classification stays stable as the agent starts speaking
              const isUserToAgent = speakerBefore === 'local' && (speakerAfter === 'remote' || speakerAfter === 'none');

              silencePeriods.push({
                startIndex: i,
                endIndex: i + silenceCount - 1,
                durationMs,
                isUserToAgent
              });
            }

            i += silenceCount - 1; // Skip ahead since we've processed these
          }
        }
      }

      // Calculate agent speaking "turns" (including pauses between agent speech)
      // A turn is from when agent starts speaking until user starts speaking
      interface SpeakingPeriod {
        startIndex: number;
        endIndex: number;
        durationMs: number;
      }
      const agentSpeakingPeriods: SpeakingPeriod[] = [];
      const MIN_SPEAKING_DURATION_MS = 200; // Minimum duration to count as a turn
      const MIN_SPEAKING_SAMPLES = Math.ceil(MIN_SPEAKING_DURATION_MS / SAMPLE_INTERVAL_MS);

      for (let i = 0; i < maxSamples; i++) {
        const remoteRMS = remoteRMSRef.current[i] ?? 0;
        const localRMS = localRMSRef.current[i] ?? 0;
        const agentStartsSpeaking = remoteRMS >= SILENCE_THRESHOLD && localRMS < SILENCE_THRESHOLD;

        if (agentStartsSpeaking) {
          // Track agent's entire turn (speaking + pauses) until user speaks
          let turnCount = 1;
          // Look ahead while user is not speaking (agent can speak or be silent)
          for (let j = i + 1; j < maxSamples; j++) {
            const remoteRMSNext = remoteRMSRef.current[j] ?? 0;
            const localRMSNext = localRMSRef.current[j] ?? 0;
            const userSpeaks = localRMSNext >= SILENCE_THRESHOLD;

            // Continue the turn as long as user doesn't speak
            if (!userSpeaks) {
              turnCount++;
            } else {
              break;
            }
          }

          // If this turn is long enough, record it
          if (turnCount >= MIN_SPEAKING_SAMPLES) {
            const durationMs = turnCount * SAMPLE_INTERVAL_MS;
            agentSpeakingPeriods.push({
              startIndex: i,
              endIndex: i + turnCount - 1,
              durationMs
            });
            i += turnCount - 1; // Skip ahead
          }
        }
      }

      // Calculate silence statistics
      const userToAgentPeriods = silencePeriods.filter(p => p.isUserToAgent);

      // Calculate initial silence (time from call start to first voice)
      let initialSilence = 0;
      if (callStartTimeRef.current !== null && firstVoiceTimeRef.current !== null) {
        initialSilence = firstVoiceTimeRef.current - callStartTimeRef.current;
      }

      // Calculate avg and max from user→agent transitions (response time analysis)
      const silenceDurations = userToAgentPeriods.map(p => p.durationMs);
      const avgSilence = silenceDurations.length > 0
        ? silenceDurations.reduce((sum, d) => sum + d, 0) / silenceDurations.length
        : 0;
      const maxSilence = silenceDurations.length > 0 ? Math.max(...silenceDurations) : 0;

      // Calculate agent speaking statistics
      const agentTalkDurations = agentSpeakingPeriods.map(p => p.durationMs);
      const avgAgentTalk = agentTalkDurations.length > 0
        ? agentTalkDurations.reduce((sum, d) => sum + d, 0) / agentTalkDurations.length
        : 0;
      const maxAgentTalk = agentTalkDurations.length > 0 ? Math.max(...agentTalkDurations) : 0;

      // Update stats if we have any data
      if (userToAgentPeriods.length > 0 || initialSilence > 0 || agentSpeakingPeriods.length > 0) {
        setSilenceStats({
          avgSilence,
          maxSilence,
          initialSilence,
          avgAgentTalk,
          maxAgentTalk
        });
      } else {
        // Clear stats if no data available
        setSilenceStats(null);
      }

      // Second pass: draw the continuous silence backgrounds
      for (const period of silencePeriods) {
        const startX = period.startIndex * pixelsPerSample;
        const endX = (period.endIndex + 1) * pixelsPerSample;
        const periodWidth = endX - startX;

        // Use different colors based on transition type
        if (period.isUserToAgent) {
          // User → Agent: Full red (measuring agent response time)
          ctx.fillStyle = "#dc2626";
        } else {
          // Agent → User or other: Subtle red (just marking the gap)
          ctx.fillStyle = "#dc262630"; // Same red but with low opacity
        }

        // Draw silence background
        ctx.fillRect(startX, 0, periodWidth, height);
      }

      // Third pass: draw duration labels only for user→agent transitions
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const period of silencePeriods) {
        if (!period.isUserToAgent) continue; // Only show duration for user→agent

        const startX = period.startIndex * pixelsPerSample;
        const endX = (period.endIndex + 1) * pixelsPerSample;
        const periodWidth = endX - startX;

        // Draw duration label at the bottom of the silence period
        const centerX = startX + periodWidth / 2;
        const labelY = height - 4; // 4px padding from bottom

        // Format duration (e.g., "1.2s" or "500ms")
        const durationText = period.durationMs >= 1000
          ? `${(period.durationMs / 1000).toFixed(1)}s`
          : `${period.durationMs}ms`;

        ctx.fillText(durationText, centerX, labelY);
      }

      // Draw center line
      ctx.strokeStyle = "#404040";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw both waveforms overlaid in the same space
      // Draw remote waveform first (blue, behind)
      if (remoteSamplesRef.current.length > 0) {
        drawOverlaidWaveform(
          ctx,
          remoteSamplesRef.current,
          0,
          height,
          pixelsPerSample,
          "#3b82f6"
        );
      }

      // Draw local waveform second (green, in front)
      if (localSamplesRef.current.length > 0) {
        drawOverlaidWaveform(
          ctx,
          localSamplesRef.current,
          0,
          height,
          pixelsPerSample,
          "#22c55e"
        );
      }

      if (localSamplesRef.current.length === 0 && remoteSamplesRef.current.length === 0) {
        drawPlaceholder(ctx, 0, height, containerWidth, "Waiting for audio...");
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, autoScroll]); // Removed localData, remoteData to keep rendering after call ends

  // Separate effect for rendering jitter graph
  useEffect(() => {
    if (!isActive || !jitterCanvasRef.current || !jitterContainerRef.current) return;

    const jitterCanvas = jitterCanvasRef.current;
    const jitterContainer = jitterContainerRef.current;
    const jitterCtx = jitterCanvas.getContext("2d");
    if (!jitterCtx) return;

    const resizeJitterCanvas = () => {
      const rect = jitterContainer.getBoundingClientRect();
      jitterCanvas.height = rect.height * window.devicePixelRatio;
    };

    resizeJitterCanvas();
    window.addEventListener("resize", resizeJitterCanvas);

    const SAMPLE_INTERVAL_MS = 50;
    const TARGET_SECONDS_PER_SCREEN = 60;
    const jitterAnimationRef = { current: null as number | null };

    const drawJitter = () => {
      if (!jitterCanvasRef.current || !jitterCtx || !jitterContainerRef.current) return;

      const height = jitterCanvasRef.current.height / window.devicePixelRatio;
      const containerWidth = baseContainerWidthRef.current!;
      const PIXELS_PER_SECOND = containerWidth / TARGET_SECONDS_PER_SCREEN;

      const maxSamples = Math.max(localJitterRef.current.length, remoteJitterRef.current.length);
      const durationSeconds = (maxSamples * SAMPLE_INTERVAL_MS) / 1000;
      const neededWidth = Math.max(durationSeconds * PIXELS_PER_SECOND, containerWidth);
      const scaledWidth = neededWidth * window.devicePixelRatio;

      jitterCtx.setTransform(1, 0, 0, 1, 0, 0);
      jitterCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

      if (jitterCanvas.width !== scaledWidth) {
        jitterCanvas.width = scaledWidth;
      }

      jitterCanvas.style.width = `${neededWidth}px`;

      const pixelsPerSample = (SAMPLE_INTERVAL_MS / 1000) * PIXELS_PER_SECOND;

      // Auto-scroll jitter to match main waveform
      if (autoScroll) {
        const scrollPos = Math.max(0, neededWidth - containerWidth);
        jitterContainer.scrollLeft = scrollPos;
      }

      // Clear with dark background
      jitterCtx.fillStyle = "#1e1e1e";
      jitterCtx.fillRect(0, 0, neededWidth, height);

      // Define jitter quality thresholds (in milliseconds)
      // WebRTC jitter values: < 20ms = excellent, 20-50ms = acceptable, > 50ms = poor
      const GOOD_THRESHOLD = 20.0; // Low jitter = good quality (green)
      const MODERATE_THRESHOLD = 50.0; // Medium jitter = moderate quality (yellow)
      // Above MODERATE_THRESHOLD = poor quality (red)

      // Draw local jitter (user audio quality) - top half
      if (localJitterRef.current.length > 0) {
        const maxJitter = Math.max(...localJitterRef.current, ...remoteJitterRef.current, 10);

        jitterCtx.lineWidth = 1.5;
        jitterCtx.globalAlpha = 0.7;

        for (let i = 0; i < localJitterRef.current.length; i++) {
          const x = i * pixelsPerSample;
          const jitterValue = localJitterRef.current[i];
          const normalizedJitter = Math.min(jitterValue / maxJitter, 1);
          const y = height / 2 - (normalizedJitter * (height / 2) * 0.8);

          // Determine color based on quality
          let color = "#22c55e"; // Green (good)
          if (jitterValue >= MODERATE_THRESHOLD) {
            color = "#dc2626"; // Red (poor)
          } else if (jitterValue >= GOOD_THRESHOLD) {
            color = "#eab308"; // Yellow (moderate)
          }

          jitterCtx.strokeStyle = color;
          jitterCtx.fillStyle = color;
          jitterCtx.fillRect(x, y, Math.max(pixelsPerSample, 2), 2);
        }
        jitterCtx.globalAlpha = 1.0;
      }

      // Draw remote jitter (agent audio quality) - bottom half
      if (remoteJitterRef.current.length > 0) {
        const maxJitter = Math.max(...localJitterRef.current, ...remoteJitterRef.current, 10);

        jitterCtx.lineWidth = 1.5;
        jitterCtx.globalAlpha = 0.7;

        for (let i = 0; i < remoteJitterRef.current.length; i++) {
          const x = i * pixelsPerSample;
          const jitterValue = remoteJitterRef.current[i];
          const normalizedJitter = Math.min(jitterValue / maxJitter, 1);
          const y = height / 2 + (normalizedJitter * (height / 2) * 0.8);

          // Determine color based on quality
          let color = "#22c55e"; // Green (good)
          if (jitterValue >= MODERATE_THRESHOLD) {
            color = "#dc2626"; // Red (poor)
          } else if (jitterValue >= GOOD_THRESHOLD) {
            color = "#eab308"; // Yellow (moderate)
          }

          jitterCtx.strokeStyle = color;
          jitterCtx.fillStyle = color;
          jitterCtx.fillRect(x, height / 2, Math.max(pixelsPerSample, 2), y - height / 2);
        }
        jitterCtx.globalAlpha = 1.0;
      }

      // Draw packet loss markers (red spikes)
      // Local packet loss (top half)
      if (localPacketLossRef.current.length > 0) {
        jitterCtx.strokeStyle = "#ef4444"; // Bright red
        jitterCtx.lineWidth = 2;
        jitterCtx.globalAlpha = 0.9;

        for (let i = 0; i < localPacketLossRef.current.length; i++) {
          const packetLoss = localPacketLossRef.current[i];
          if (packetLoss > 0.1) { // Only show if > 0.1% loss
            const x = i * pixelsPerSample;
            const spikeHeight = Math.min(packetLoss * 2, height / 4); // Scale spike based on loss %

            jitterCtx.beginPath();
            jitterCtx.moveTo(x, height / 2);
            jitterCtx.lineTo(x, height / 2 - spikeHeight);
            jitterCtx.stroke();
          }
        }
        jitterCtx.globalAlpha = 1.0;
      }

      // Remote packet loss (bottom half)
      if (remotePacketLossRef.current.length > 0) {
        jitterCtx.strokeStyle = "#ef4444"; // Bright red
        jitterCtx.lineWidth = 2;
        jitterCtx.globalAlpha = 0.9;

        for (let i = 0; i < remotePacketLossRef.current.length; i++) {
          const packetLoss = remotePacketLossRef.current[i];
          if (packetLoss > 0.1) { // Only show if > 0.1% loss
            const x = i * pixelsPerSample;
            const spikeHeight = Math.min(packetLoss * 2, height / 4); // Scale spike based on loss %

            jitterCtx.beginPath();
            jitterCtx.moveTo(x, height / 2);
            jitterCtx.lineTo(x, height / 2 + spikeHeight);
            jitterCtx.stroke();
          }
        }
        jitterCtx.globalAlpha = 1.0;
      }

      // Draw center line
      jitterCtx.strokeStyle = "#404040";
      jitterCtx.lineWidth = 1;
      jitterCtx.beginPath();
      jitterCtx.moveTo(0, height / 2);
      jitterCtx.lineTo(neededWidth, height / 2);
      jitterCtx.stroke();

      if (localJitterRef.current.length === 0 && remoteJitterRef.current.length === 0) {
        jitterCtx.fillStyle = "#808080";
        jitterCtx.font = "10px monospace";
        jitterCtx.textAlign = "center";
        jitterCtx.fillText("No quality data yet...", containerWidth / 2, height / 2);
      }

      jitterAnimationRef.current = requestAnimationFrame(drawJitter);
    };

    drawJitter();

    return () => {
      window.removeEventListener("resize", resizeJitterCanvas);
      if (jitterAnimationRef.current) {
        cancelAnimationFrame(jitterAnimationRef.current);
      }
    };
  }, [isActive, autoScroll]);

  const handleClear = () => {
    localSamplesRef.current = [];
    remoteSamplesRef.current = [];
    localRMSRef.current = [];
    remoteRMSRef.current = [];
    localJitterRef.current = [];
    remoteJitterRef.current = [];
    localPacketLossRef.current = [];
    remotePacketLossRef.current = [];
    scrollOffsetRef.current = 0;
    lastSampleTimeRef.current = 0;
    callStartTimeRef.current = null;
    firstVoiceTimeRef.current = null;
    // Don't reset baseContainerWidthRef - keep using the same viewport width
    setSilenceStats(null);
    setCurrentCodec('');
    setCurrentMOS(null);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
    if (jitterContainerRef.current) {
      jitterContainerRef.current.scrollLeft = 0;
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-base-300 bg-base-200">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="checkbox checkbox-xs"
          />
          Auto-scroll
        </label>
        <button
          onClick={handleClear}
          className="btn btn-ghost btn-xs ml-auto"
          title="Clear waveforms"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-3 h-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
          Clear
        </button>
      </div>

      {/* Scrollable canvas container */}
      <div
        ref={containerRef}
        className="flex-1 w-full max-w-full overflow-x-auto overflow-y-hidden"
        style={height ? { height: `${height}px` } : undefined}
      >
        <canvas
          ref={canvasRef}
          className="block h-full"
        />
      </div>

      {/* Jitter graph */}
      <div className="border-t border-base-300">
        <div className="px-2 py-1 bg-base-200 border-b border-base-300">
          <span className="text-xs font-medium text-base-content/60">Audio Quality (Jitter + Packet Loss)</span>
        </div>
        <div
          ref={jitterContainerRef}
          className="w-full max-w-full overflow-x-auto overflow-y-hidden bg-base-200"
          style={{ height: '60px' }}
        >
          <canvas
            ref={jitterCanvasRef}
            className="block h-full"
          />
        </div>
      </div>

      {/* Statistics display */}
      <div className="px-2 py-2 border-t border-base-300 bg-base-200">
        <div className="grid grid-cols-7 gap-4 text-xs">
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Initial Silence</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.initialSilence > 0
                ? silenceStats.initialSilence >= 1000
                  ? `${(silenceStats.initialSilence / 1000).toFixed(2)}s`
                  : `${silenceStats.initialSilence.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Avg Resp.</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.avgSilence > 0
                ? silenceStats.avgSilence >= 1000
                  ? `${(silenceStats.avgSilence / 1000).toFixed(2)}s`
                  : `${silenceStats.avgSilence.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Max Resp.</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.maxSilence > 0
                ? silenceStats.maxSilence >= 1000
                  ? `${(silenceStats.maxSilence / 1000).toFixed(2)}s`
                  : `${silenceStats.maxSilence.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Avg Agent</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.avgAgentTalk > 0
                ? silenceStats.avgAgentTalk >= 1000
                  ? `${(silenceStats.avgAgentTalk / 1000).toFixed(2)}s`
                  : `${silenceStats.avgAgentTalk.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Max Agent</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.maxAgentTalk > 0
                ? silenceStats.maxAgentTalk >= 1000
                  ? `${(silenceStats.maxAgentTalk / 1000).toFixed(2)}s`
                  : `${silenceStats.maxAgentTalk.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">MOS Score</span>
            <span className={`text-base-content font-mono ${
              currentMOS !== null
                ? currentMOS >= 4 ? 'text-success'
                  : currentMOS >= 3 ? 'text-warning'
                  : 'text-error'
                : ''
            }`}>
              {currentMOS !== null ? currentMOS.toFixed(2) : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Codec</span>
            <span className="text-base-content font-mono uppercase">
              {currentCodec || '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function drawOverlaidWaveform(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  offsetY: number,
  height: number,
  pixelsPerSample: number,
  color: string
) {
  const centerY = offsetY + height / 2;

  // Draw waveform
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8; // Slight transparency so overlapping waveforms are visible
  ctx.beginPath();

  for (let i = 0; i < samples.length; i++) {
    const x = i * pixelsPerSample;
    const v = samples[i] / 128.0; // Normalize to 0-2 range
    const y = centerY + ((v - 1) * height * 10) / 2; // 1.6 for larger amplitude

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.globalAlpha = 1.0; // Reset alpha
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  offsetY: number,
  height: number,
  width: number,
  message: string
) {
  const centerY = offsetY + height / 2;

  // Draw message
  ctx.fillStyle = "#808080";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, centerY);
  ctx.textAlign = "left";
}
