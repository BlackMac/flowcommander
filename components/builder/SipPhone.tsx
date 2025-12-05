"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SipCredentials } from "@/app/api/sip/credentials/route";

type CallState = "idle" | "connecting" | "ringing" | "active" | "ended" | "error";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface SipPhoneProps {
  phoneNumber: string; // The number to call (display format like "02041-34873-10")
  webhookUrl: string | null; // Webhook URL (not used anymore, kept for compatibility)
  projectName: string; // Project name (not used anymore, kept for compatibility)
  onCallStateChange?: (state: CallState) => void;
  disabled?: boolean; // If true, disable calling (e.g., when code has undeployed changes)
}

export function SipPhone({ phoneNumber, webhookUrl, projectName, onCallStateChange, disabled = false }: SipPhoneProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [credentials, setCredentials] = useState<SipCredentials | null>(null);
  const [isSipgateUser, setIsSipgateUser] = useState<boolean | null>(null);

  // Audio device state
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [selectedInputId, setSelectedInputId] = useState<string>("");

  // Refs for SIP.js objects
  const userAgentRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ringbackContextRef = useRef<AudioContext | null>(null);
  const ringbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupStreamRef = useRef<MediaStream | null>(null);

  // Update parent when call state changes
  useEffect(() => {
    onCallStateChange?.(callState);
  }, [callState, onCallStateChange]);

  // Play/stop ringback tone based on call state using Web Audio API
  useEffect(() => {
    if (callState === "ringing") {
      // Create audio context if needed
      if (!ringbackContextRef.current) {
        ringbackContextRef.current = new AudioContext();
      }

      const context = ringbackContextRef.current;

      // Function to play one ringback beep (425 Hz for 1 second)
      const playRingback = () => {
        // Create oscillator and gain node
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = 425; // European ringback frequency

        // Connect nodes: oscillator -> gain -> destination
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        // Set volume envelope: fade in, sustain, fade out
        const now = context.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05); // Fade in
        gainNode.gain.setValueAtTime(0.3, now + 0.95); // Sustain
        gainNode.gain.linearRampToValueAtTime(0, now + 1.0); // Fade out

        // Play for 1 second
        oscillator.start(now);
        oscillator.stop(now + 1.0);

        // Clean up
        oscillator.onended = () => {
          oscillator.disconnect();
          gainNode.disconnect();
        };
      };

      // Play immediately and then every 5 seconds (1s on + 4s off)
      playRingback();
      ringbackIntervalRef.current = setInterval(playRingback, 5000);
    } else {
      // Stop ringback
      if (ringbackIntervalRef.current) {
        clearInterval(ringbackIntervalRef.current);
        ringbackIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or state change
    return () => {
      if (ringbackIntervalRef.current) {
        clearInterval(ringbackIntervalRef.current);
        ringbackIntervalRef.current = null;
      }
    };
  }, [callState]);

  // Check if user is logged in via sipgate and can make calls
  useEffect(() => {
    const checkSipgateUser = async () => {
      try {
        const res = await fetch("/api/sip/credentials");
        if (res.ok) {
          const creds = await res.json();
          setCredentials(creds);
          setIsSipgateUser(true);
        } else if (res.status === 403) {
          // Not a sipgate user (logged in with GitHub, etc.)
          setIsSipgateUser(false);
        } else if (res.status === 401) {
          // Token expired or not authenticated - show button with error
          setIsSipgateUser(true);
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Please re-login with sipgate to enable calling");
        } else {
          // Other error (500, 404) - show button with error so user knows something's wrong
          setIsSipgateUser(true);
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to load SIP credentials");
        }
      } catch (err) {
        console.error("[SipPhone] Failed to check credentials:", err);
        // Network error - show button with error, don't hide it
        setIsSipgateUser(true);
        setError("Failed to connect. Check your network.");
      }
    };

    checkSipgateUser();
  }, []);

  // Enumerate audio devices (inputs and outputs)
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        // Request microphone permission first to get device labels
        // Keep the stream alive to "warm up" the audio device and prevent audio gaps
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        warmupStreamRef.current = stream;

        const devices = await navigator.mediaDevices.enumerateDevices();

        // Get output devices (speakers)
        const audioOutputs = devices
          .filter((device) => device.kind === "audiooutput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${device.deviceId.slice(0, 4)}`,
          }));

        // Get input devices (microphones)
        const audioInputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 4)}`,
          }));

        setOutputDevices(audioOutputs);
        setInputDevices(audioInputs);

        // Select default output device if not already selected
        if (!selectedOutputId && audioOutputs.length > 0) {
          const defaultDevice = audioOutputs.find((d) => d.deviceId === "default") || audioOutputs[0];
          setSelectedOutputId(defaultDevice.deviceId);
        }

        // Select default input device if not already selected
        if (!selectedInputId && audioInputs.length > 0) {
          const defaultDevice = audioInputs.find((d) => d.deviceId === "default") || audioInputs[0];
          setSelectedInputId(defaultDevice.deviceId);
        }
      } catch (err) {
        console.error("[SipPhone] Failed to enumerate devices:", err);
      }
    };

    if (isSipgateUser) {
      enumerateDevices();
    }

    // Listen for device changes
    const handleDeviceChange = () => enumerateDevices();
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
      // Clean up warmup stream
      if (warmupStreamRef.current) {
        warmupStreamRef.current.getTracks().forEach((track) => track.stop());
        warmupStreamRef.current = null;
      }
    };
  }, [isSipgateUser, selectedOutputId, selectedInputId]);

  // Update audio output device when selection changes
  useEffect(() => {
    if (audioRef.current && selectedOutputId) {
      // setSinkId is not available on all browsers
      const audio = audioRef.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (audio.setSinkId) {
        audio.setSinkId(selectedOutputId).catch((err) => {
          console.error("[SipPhone] Failed to set audio output device:", err);
        });
      }
    }
  }, [selectedOutputId]);

  // Initialize SIP.js UserAgent
  const initUserAgent = useCallback(async () => {
    if (!credentials) return null;

    // Dynamic import to avoid SSR issues
    const { Web } = await import("sip.js");

    const uri = `sip:${credentials.username}@sipgate.de`;

    const userAgent = new Web.SimpleUser(credentials.websocketUrl, {
      aor: uri,
      media: {
        constraints: { audio: true, video: false },
        remote: { audio: audioRef.current! },
      },
      userAgentOptions: {
        authorizationUsername: credentials.username,
        authorizationPassword: credentials.password,
        displayName: "FlowCommander",
      },
    });

    // Set up event handlers
    userAgent.delegate = {
      onCallReceived: async () => {
        // We don't handle incoming calls
        await userAgent.decline();
      },
      onCallAnswered: () => {
        setCallState("active");
      },
      onCallHangup: () => {
        setCallState("ended");
        setTimeout(() => setCallState("idle"), 2000);
      },
    };

    return userAgent;
  }, [credentials]);

  // Track last used input device to know when to reinitialize
  const lastInputIdRef = useRef<string>("");

  // Make a call
  const handleCall = async () => {
    if (!credentials) {
      setError("No SIP credentials available");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Stop warmup stream before making the call (call will create its own stream)
    if (warmupStreamRef.current) {
      warmupStreamRef.current.getTracks().forEach((track) => track.stop());
      warmupStreamRef.current = null;
    }

    try {
      // Reinitialize user agent if microphone changed or not initialized
      if (!userAgentRef.current || lastInputIdRef.current !== selectedInputId) {
        // Disconnect existing user agent if any
        if (userAgentRef.current) {
          try {
            await userAgentRef.current.disconnect();
          } catch {
            // Ignore disconnect errors
          }
        }
        userAgentRef.current = await initUserAgent();
        lastInputIdRef.current = selectedInputId;
      }

      const userAgent = userAgentRef.current;
      if (!userAgent) {
        throw new Error("Failed to initialize SIP client");
      }

      // Connect to the server
      setCallState("connecting");
      await userAgent.connect();

      // Format phone number for SIP (remove dashes, add country code if needed)
      let formattedNumber = phoneNumber.replace(/-/g, "");
      // If it starts with 0, replace with +49 for German numbers
      if (formattedNumber.startsWith("0")) {
        formattedNumber = "+49" + formattedNumber.substring(1);
      }

      // Build call options with selected microphone
      const inviterOptions = selectedInputId
        ? {
            sessionDescriptionHandlerOptions: {
              constraints: {
                audio: { deviceId: { exact: selectedInputId } },
                video: false,
              },
            },
          }
        : undefined;

      // Make the call
      setCallState("ringing");
      await userAgent.call(`sip:${formattedNumber}@sipgate.de`, inviterOptions);
    } catch (err) {
      console.error("[SipPhone] Call failed:", err);
      setError(err instanceof Error ? err.message : "Failed to make call");
      setCallState("error");
      setTimeout(() => setCallState("idle"), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Hang up the call
  const handleHangup = async () => {
    try {
      if (userAgentRef.current) {
        await userAgentRef.current.hangup();
      }
      setCallState("ended");
      setTimeout(() => setCallState("idle"), 2000);
    } catch (err) {
      console.error("[SipPhone] Hangup failed:", err);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (userAgentRef.current) {
        try {
          userAgentRef.current.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  // Don't render if not a sipgate user
  if (isSipgateUser === null) {
    // Still loading
    return null;
  }

  if (isSipgateUser === false) {
    // Not a sipgate user - don't show the call button
    return null;
  }

  const isCallActive = callState === "connecting" || callState === "ringing" || callState === "active";

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden audio element for remote audio */}
      <audio ref={audioRef} autoPlay />

      {/* Call button with audio device dropdown */}
      <div className="flex gap-1">
        {isCallActive ? (
          <button
            onClick={handleHangup}
            className="btn btn-error btn-sm gap-2 flex-1"
            disabled={callState === "connecting"}
          >
            {callState === "connecting" && (
              <span className="loading loading-spinner loading-xs"></span>
            )}
            {callState === "ringing" && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4 animate-pulse"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                />
              </svg>
            )}
            {callState === "active" && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 3.75L18 6m0 0l2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.055.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z"
                />
              </svg>
            )}
            {callState === "connecting" ? "Connecting..." : callState === "ringing" ? "Ringing..." : "Hang Up"}
          </button>
        ) : (
          <button
            onClick={handleCall}
            disabled={isLoading || callState === "ended" || disabled}
            className="btn btn-success btn-sm gap-2 flex-1"
            title={disabled ? "Wait for deployment to finish" : undefined}
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                />
              </svg>
            )}
            {callState === "ended" ? "Call Ended" : "Call"}
          </button>
        )}

        {/* Audio device dropdown */}
        {(outputDevices.length > 1 || inputDevices.length > 1) && (
          <div className="dropdown dropdown-end dropdown-top">
            <button
              tabIndex={0}
              className="btn btn-ghost btn-sm btn-square"
              title="Select audio devices"
              disabled={isCallActive || disabled}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
            </button>
            <div
              tabIndex={0}
              className="dropdown-content z-[1] p-2 shadow bg-base-100 rounded-box w-56 border border-base-300"
            >
              {/* Microphone section */}
              {inputDevices.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-base-content/60 flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-3 h-3"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                    Microphone
                  </div>
                  <ul className="menu menu-sm p-0">
                    {inputDevices.map((device) => (
                      <li key={device.deviceId}>
                        <button
                          onClick={() => setSelectedInputId(device.deviceId)}
                          className={selectedInputId === device.deviceId ? "active" : ""}
                        >
                          <span className="truncate">{device.label}</span>
                          {selectedInputId === device.deviceId && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="w-4 h-4 shrink-0"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Speaker section */}
              {outputDevices.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-base-content/60 flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-3 h-3"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                      />
                    </svg>
                    Speaker
                  </div>
                  <ul className="menu menu-sm p-0">
                    {outputDevices.map((device) => (
                      <li key={device.deviceId}>
                        <button
                          onClick={() => setSelectedOutputId(device.deviceId)}
                          className={selectedOutputId === device.deviceId ? "active" : ""}
                        >
                          <span className="truncate">{device.label}</span>
                          {selectedOutputId === device.deviceId && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="w-4 h-4 shrink-0"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-error">{error}</p>
      )}

      {/* Call state indicator */}
      {callState === "active" && (
        <p className="text-xs text-success flex items-center gap-1">
          <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
          Call in progress
        </p>
      )}
    </div>
  );
}
