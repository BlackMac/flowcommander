"use client";

import { useRef, useEffect, useState } from "react";
import { useAudioStreams } from "./hooks/useAudioStreams";

interface WaveformVisualizerProps {
  localStream: MediaStream;
  remoteStream: MediaStream;
  isActive: boolean;
}

export function WaveformVisualizer({
  localStream,
  remoteStream,
  isActive,
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

  // Clear samples when streams change
  useEffect(() => {
    localSamplesRef.current = [];
    remoteSamplesRef.current = [];
    localRMSRef.current = [];
    remoteRMSRef.current = [];
    scrollOffsetRef.current = 0;
    lastSampleTimeRef.current = 0;
  }, [localStream, remoteStream]);

  // Separate effect for audio sampling - runs always when streams exist
  useEffect(() => {
    if (!localData && !remoteData) return;

    const SAMPLE_INTERVAL_MS = 50; // Sample audio every 50ms for smooth visualization
    let lastSampleTime = performance.now();

    const sampleAudio = () => {
      const currentTime = performance.now();

      // Only add samples at fixed intervals (not every frame) to control time scaling
      if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
        lastSampleTime = currentTime;
        lastSampleTimeRef.current = currentTime;

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
          const rms = Math.sqrt(sumSquares / localData.dataArray.length);
          localRMSRef.current.push(rms);
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
          const rms = Math.sqrt(sumSquares / remoteData.dataArray.length);
          remoteRMSRef.current.push(rms);
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

    // Set canvas size to match display size
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.height = rect.height * window.devicePixelRatio;
      // Don't scale here - we'll handle it in the draw loop
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Configuration: 60 seconds should fill approximately the screen width
    const TARGET_SECONDS_PER_SCREEN = 60;
    const containerWidth = container.getBoundingClientRect().width;
    const PIXELS_PER_SECOND = containerWidth / TARGET_SECONDS_PER_SCREEN; // ~20 pixels/second for 1200px screen
    const SAMPLE_INTERVAL_MS = 50; // Must match sampling interval

    const draw = () => {
      if (!canvasRef.current || !ctx) return;

      const height = canvasRef.current.height / window.devicePixelRatio;

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

      if (canvas.width !== scaledWidth) {
        canvas.width = scaledWidth;
        // Set CSS width to logical size, not scaled size
        canvas.style.width = `${neededWidth}px`;
      }

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
          "#3b82f6",
          "Incoming (Agent)",
          8 // label y position
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
          "#22c55e",
          "Outgoing (You)",
          24 // label y position, below the first
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
  }, [localData, remoteData, isActive, autoScroll]);

  const handleClear = () => {
    localSamplesRef.current = [];
    remoteSamplesRef.current = [];
    localRMSRef.current = [];
    remoteRMSRef.current = [];
    scrollOffsetRef.current = 0;
    lastSampleTimeRef.current = 0;
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  };

  return (
    <div className="flex flex-col h-full">
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
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <canvas
          ref={canvasRef}
          className="block"
          style={{ height: "80px" }}
        />
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
  color: string,
  label: string,
  labelY: number
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

  // Draw label
  ctx.fillStyle = color;
  ctx.font = "10px monospace";
  ctx.fillText(label, 8, labelY);
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
