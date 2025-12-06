"use client";

import { useState, useCallback } from "react";
import { SipPhone, type JitterStats } from "@/components/builder/SipPhone";
import { WaveformVisualizer } from "@/components/builder/WaveformVisualizer";

type CallState = "idle" | "connecting" | "ringing" | "active" | "ended" | "error";

export default function PhoneToolPage() {
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [phoneNumber, setPhoneNumber] = useState<string>("+491579-2380294");
  const [jitterStats, setJitterStats] = useState<JitterStats | null>(null);

  const handleAudioStreamsChange = useCallback((local: MediaStream | null, remote: MediaStream | null) => {
    setLocalAudioStream(local);
    setRemoteAudioStream(remote);
  }, []);

  const handleJitterUpdate = useCallback((jitter: JitterStats | null) => {
    setJitterStats(jitter);
  }, []);

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <div className="navbar bg-base-100 border-b border-base-300">
        <div className="flex-1">
          <h1 className="text-xl font-bold ml-4">Phone Testing Tool</h1>
        </div>
        <div className="flex-none">
          <a href="/projects" className="btn btn-ghost btn-sm">
            Back to Projects
          </a>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto p-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phone controls */}
          <div className="lg:col-span-1">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Make a Call</h2>
                <p className="text-sm text-base-content/60 mb-4">
                  Test the phone component and visualize audio waveforms in real-time.
                </p>

                {/* Phone number input */}
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">Phone Number</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 0800-000000"
                    className="input input-bordered w-full"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={callState !== "idle"}
                  />
                </div>

                {/* Sample numbers */}
                <div className="mt-2">
                  <p className="text-xs text-base-content/50 mb-2">Quick dial:</p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setPhoneNumber("+43720224117")}
                      className="btn btn-ghost btn-xs justify-start text-xs"
                      disabled={callState !== "idle"}
                    >
                      +43720224117 (Fonio)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhoneNumber("+493083791694")}
                      className="btn btn-ghost btn-xs justify-start text-xs"
                      disabled={callState !== "idle"}
                    >
                      +493083791694 (Hallo Petra)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhoneNumber("+491579-2380294")}
                      className="btn btn-ghost btn-xs justify-start text-xs"
                      disabled={callState !== "idle"}
                    >
                      +491579-2380294 (sipgate)
                    </button>
                  </div>
                </div>

                {/* SIP Phone component */}
                <div className="mt-4">
                  <SipPhone
                    phoneNumber={phoneNumber}
                    webhookUrl={null}
                    projectName="Phone Testing Tool"
                    onAudioStreamsChange={handleAudioStreamsChange}
                    onCallStateChange={setCallState}
                    onJitterUpdate={handleJitterUpdate}
                    disabled={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Waveform visualizer */}
          <div className="lg:col-span-2">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Audio Waveform</h2>
                <p className="text-sm text-base-content/60 mb-4">
                  Real-time visualization of local (green) and remote (blue) audio streams.
                  Red sections indicate silence between speakers with duration labels for agent response time.
                </p>

                {/* Waveform container */}
                <div className="h-[400px] border border-base-300 rounded-lg overflow-hidden bg-base-200 w-full">
                  <WaveformVisualizer
                    localStream={localAudioStream}
                    remoteStream={remoteAudioStream}
                    jitterStats={jitterStats}
                    isActive={true}
                  />
                </div>

                {/* Legend */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-[#22c55e] rounded"></div>
                    <span className="text-base-content/70">Outgoing (You)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-[#3b82f6] rounded"></div>
                    <span className="text-base-content/70">Incoming (Agent)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-[#dc2626] rounded"></div>
                    <span className="text-base-content/70">User→Agent Silence (with duration)</span>
                  </div>
                </div>

                {/* Features info */}
                <div className="divider"></div>
                <div className="text-xs text-base-content/60 space-y-2">
                  <p className="font-semibold">Features:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Real-time audio visualization with 50ms sampling</li>
                    <li>60 seconds of audio fills approximately screen width</li>
                    <li>RMS-based silence detection (≥500ms duration)</li>
                    <li>Speaker-aware: only highlights conversational gaps</li>
                    <li>Bright red + duration for user→agent (response time)</li>
                    <li>Subtle red for agent→user transitions</li>
                    <li>Auto-scroll follows latest audio</li>
                    <li>Continues accumulating when in background</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
