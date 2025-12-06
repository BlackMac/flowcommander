"use client";

import { useRef, useEffect, useState } from "react";
import { useAudioStreams } from "./hooks/useAudioStreams";

interface WaveformVisualizerProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isActive: boolean;
  height?: number; // Height in pixels (default: 80)
}

export function WaveformVisualizer({
  localStream,
  remoteStream,
  isActive,
  height = 80,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const { localData, remoteData } = useAudioStreams(localStream, remoteStream);

  // Store accumulated waveform samples and RMS energy levels
  const localSamplesRef = useRef<number[]>([]);
  const remoteSamplesRef = useRef<number[]>([]);
  const localRMSRef = useRef<number[]>([]); // RMS energy for silence detection
  const remoteRMSRef = useRef<number[]>([]); // RMS energy for silence detection
  const scrollOffsetRef = useRef<number>(0);
  const lastSampleTimeRef = useRef<number>(0);

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

  const handleClear = () => {
    localSamplesRef.current = [];
    remoteSamplesRef.current = [];
    localRMSRef.current = [];
    remoteRMSRef.current = [];
    scrollOffsetRef.current = 0;
    lastSampleTimeRef.current = 0;
    callStartTimeRef.current = null;
    firstVoiceTimeRef.current = null;
    // Don't reset baseContainerWidthRef - keep using the same viewport width
    setSilenceStats(null);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
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

      {/* Statistics display */}
      <div className="px-2 py-2 border-t border-base-300 bg-base-200">
        <div className="grid grid-cols-5 gap-4 text-xs">
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
            <span className="text-base-content/50 font-medium mb-1">Avg Response Time</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.avgSilence > 0
                ? silenceStats.avgSilence >= 1000
                  ? `${(silenceStats.avgSilence / 1000).toFixed(2)}s`
                  : `${silenceStats.avgSilence.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Max Response Time</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.maxSilence > 0
                ? silenceStats.maxSilence >= 1000
                  ? `${(silenceStats.maxSilence / 1000).toFixed(2)}s`
                  : `${silenceStats.maxSilence.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Avg Agent Talk</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.avgAgentTalk > 0
                ? silenceStats.avgAgentTalk >= 1000
                  ? `${(silenceStats.avgAgentTalk / 1000).toFixed(2)}s`
                  : `${silenceStats.avgAgentTalk.toFixed(0)}ms`
                : '-'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-base-content/50 font-medium mb-1">Max Agent Talk</span>
            <span className="text-base-content font-mono">
              {silenceStats && silenceStats.maxAgentTalk > 0
                ? silenceStats.maxAgentTalk >= 1000
                  ? `${(silenceStats.maxAgentTalk / 1000).toFixed(2)}s`
                  : `${silenceStats.maxAgentTalk.toFixed(0)}ms`
                : '-'}
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
