"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { EventLog } from "./EventLog";
import { WaveformVisualizer } from "./WaveformVisualizer";
import type { WebhookEvent } from "@/types/database";

interface LogsPanelProps {
  projectId: string;
  events: WebhookEvent[];
  sandboxRunning: boolean;
  onClearEvents?: () => void;
  flowDiagramError?: string | null;
  onClearFlowDiagramError?: () => void;
  crashError?: string | null;
  onClearCrashError?: () => void;
  onDebugCrashError?: () => void;
  localAudioStream?: MediaStream | null;
  remoteAudioStream?: MediaStream | null;
  isCallActive?: boolean;
}

interface ErrorMessage {
  id: string;
  timestamp: string;
  message: string;
  source: "console" | "event" | "flow-diagram" | "crash";
}

export function LogsPanel({ projectId, events, sandboxRunning, onClearEvents, flowDiagramError, onClearFlowDiagramError, crashError, onClearCrashError, onDebugCrashError, localAudioStream, remoteAudioStream, isCallActive }: LogsPanelProps) {
  const [activeTab, setActiveTab] = useState<"events" | "console" | "errors" | "waveform">("events");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLPreElement>(null);
  const lastLogCountRef = useRef(0);

  // Extract error messages from console logs, events, and flow diagram
  const errorMessages = useMemo<ErrorMessage[]>(() => {
    const errors: ErrorMessage[] = [];

    // Add crash error if present (highest priority)
    if (crashError) {
      errors.push({
        id: "crash-error",
        timestamp: new Date().toISOString(),
        message: crashError,
        source: "crash",
      });
    }

    // Add flow diagram error if present
    if (flowDiagramError) {
      errors.push({
        id: "flow-diagram-error",
        timestamp: new Date().toISOString(),
        message: flowDiagramError,
        source: "flow-diagram",
      });
    }

    // Extract errors from console logs
    consoleLogs.forEach((line, index) => {
      const isError =
        line.startsWith("[stderr]") ||
        line.toLowerCase().includes("error") ||
        line.toLowerCase().includes("exception") ||
        line.toLowerCase().includes("typeerror") ||
        line.toLowerCase().includes("referenceerror") ||
        line.toLowerCase().includes("syntaxerror");

      if (isError) {
        errors.push({
          id: `console-${index}`,
          timestamp: new Date().toISOString(),
          message: line.replace("[stderr] ", "").trim(),
          source: "console",
        });
      }
    });

    // Extract errors from webhook events (e.g., failed requests)
    events.forEach((event) => {
      const eventData = event.event_data as Record<string, unknown> | null;
      if (eventData?.error || event.event_type === "error") {
        errors.push({
          id: event.id,
          timestamp: event.created_at,
          message: String(eventData?.error || eventData?.message || "Unknown error"),
          source: "event",
        });
      }
    });

    // Sort by timestamp descending (newest first)
    return errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [consoleLogs, events, flowDiagramError, crashError]);

  const handleCopyEvents = async () => {
    const eventsJson = JSON.stringify(events, null, 2);
    await navigator.clipboard.writeText(eventsJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyConsole = async () => {
    await navigator.clipboard.writeText(consoleLogs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyErrors = async () => {
    const errorText = errorMessages.map((e) => `[${e.source}] ${e.message}`).join("\n");
    await navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearConsole = () => {
    setConsoleLogs([]);
  };

  const clearErrors = () => {
    setConsoleLogs([]);
    onClearEvents?.();
    onClearFlowDiagramError?.();
    onClearCrashError?.();
  };

  // Poll for live logs when sandbox is running and console tab is active
  useEffect(() => {
    if (!sandboxRunning) {
      return;
    }

    const fetchLiveLogs = async () => {
      try {
        const res = await fetch(`/api/sandbox/logs?projectId=${projectId}`);
        const data = await res.json();
        if (data.logs) {
          // Extract just the captured output section
          const capturedMatch = data.logs.match(/=== Captured Output ===\n([\s\S]*?)(?:===|$)/);
          if (capturedMatch) {
            const lines = capturedMatch[1].trim().split("\n").filter((l: string) => l.trim());
            // Only update if we have new logs
            if (lines.length > lastLogCountRef.current) {
              setConsoleLogs(lines);
              lastLogCountRef.current = lines.length;
            }
          }
        }
      } catch {
        // Silently fail - will retry on next poll
      }
    };

    // Fetch immediately
    fetchLiveLogs();

    // Poll every 2 seconds
    const interval = setInterval(fetchLiveLogs, 2000);

    return () => clearInterval(interval);
  }, [projectId, sandboxRunning]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs, autoScroll]);

  // Reset log count when sandbox stops
  useEffect(() => {
    if (!sandboxRunning) {
      lastLogCountRef.current = 0;
    }
  }, [sandboxRunning]);

  const handleTabChange = (tab: "events" | "console" | "errors" | "waveform") => {
    setActiveTab(tab);
  };

  // Helper to format log line with color
  const formatLogLine = (line: string) => {
    if (line.startsWith("[stderr]")) {
      return <span className="text-error">{line}</span>;
    }
    if (line.toLowerCase().includes("error") || line.toLowerCase().includes("exception")) {
      return <span className="text-error">{line}</span>;
    }
    if (line.toLowerCase().includes("warning") || line.toLowerCase().includes("warn")) {
      return <span className="text-warning">{line}</span>;
    }
    if (line.includes("Server listening") || line.includes("ready")) {
      return <span className="text-success">{line}</span>;
    }
    return line;
  };

  // Format time for error messages
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="bg-base-200 border-t border-base-300 h-48 flex flex-col">
      {/* Tabs */}
      <div className="flex items-center border-b border-base-300 px-4">
        <div role="tablist" className="tabs tabs-sm">
          <button
            role="tab"
            className={`tab ${activeTab === "events" ? "tab-active" : ""}`}
            onClick={() => handleTabChange("events")}
          >
            Events
            {events.length > 0 && (
              <span className="badge badge-xs badge-primary ml-1">
                {events.length}
              </span>
            )}
          </button>
          <button
            role="tab"
            className={`tab ${activeTab === "console" ? "tab-active" : ""}`}
            onClick={() => handleTabChange("console")}
            disabled={!sandboxRunning}
          >
            Console
            {sandboxRunning && consoleLogs.length > 0 && (
              <span className="badge badge-xs badge-secondary ml-1">
                {consoleLogs.length}
              </span>
            )}
          </button>
          <button
            role="tab"
            className={`tab ${activeTab === "errors" ? "tab-active" : ""}`}
            onClick={() => handleTabChange("errors")}
          >
            Errors
            {errorMessages.length > 0 && (
              <span className="badge badge-xs badge-error ml-1">
                {errorMessages.length}
              </span>
            )}
          </button>
          <button
            role="tab"
            className={`tab ${activeTab === "waveform" ? "tab-active" : ""}`}
            onClick={() => handleTabChange("waveform")}
            disabled={!isCallActive}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-3 h-3 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
              />
            </svg>
            Waveform
            {isCallActive && <span className="badge badge-xs badge-success ml-1">Live</span>}
          </button>
        </div>
        <div className="ml-auto flex gap-1">
          {activeTab === "events" && events.length > 0 && (
            <>
              <button
                onClick={handleCopyEvents}
                className="btn btn-ghost btn-xs"
                title="Copy events as JSON"
              >
                {copied ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-3 h-3 text-success"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
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
                      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                    />
                  </svg>
                )}
                Copy
              </button>
              {onClearEvents && (
                <button
                  onClick={onClearEvents}
                  className="btn btn-ghost btn-xs"
                  title="Clear events"
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
              )}
            </>
          )}
          {activeTab === "console" && sandboxRunning && (
            <>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="checkbox checkbox-xs"
                />
                Auto-scroll
              </label>
              {consoleLogs.length > 0 && (
                <>
                  <button
                    onClick={handleCopyConsole}
                    className="btn btn-ghost btn-xs"
                    title="Copy console output"
                  >
                    {copied ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-3 h-3 text-success"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
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
                          d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={clearConsole}
                    className="btn btn-ghost btn-xs"
                    title="Clear console"
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
                  </button>
                </>
              )}
            </>
          )}
          {activeTab === "errors" && errorMessages.length > 0 && (
            <>
              <button
                onClick={handleCopyErrors}
                className="btn btn-ghost btn-xs"
                title="Copy errors"
              >
                {copied ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-3 h-3 text-success"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
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
                      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                    />
                  </svg>
                )}
                Copy
              </button>
              <button
                onClick={clearErrors}
                className="btn btn-ghost btn-xs"
                title="Clear errors"
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
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Events tab */}
        <div className={activeTab === "events" ? "h-full" : "hidden h-full"}>
          <EventLog events={events} />
        </div>

        {/* Console tab */}
        <div className={activeTab === "console" ? "h-full" : "hidden h-full"}>
          {sandboxRunning ? (
            <pre
              ref={consoleRef}
              className="text-xs font-mono whitespace-pre-wrap text-base-content/80 h-full overflow-y-auto"
            >
              {consoleLogs.length > 0 ? (
                consoleLogs.map((line, i) => (
                  <div key={i}>{formatLogLine(line)}</div>
                ))
              ) : (
                <span className="text-base-content/50">Waiting for output...</span>
              )}
            </pre>
          ) : (
            <div className="text-center text-base-content/50 py-4 text-xs">
              Start the sandbox to view console output
            </div>
          )}
        </div>

        {/* Waveform tab - keep mounted to continue accumulating */}
        <div className={activeTab === "waveform" ? "h-full" : "hidden h-full"}>
          <WaveformVisualizer
            localStream={localAudioStream || null}
            remoteStream={remoteAudioStream || null}
            isActive={activeTab === "waveform"}
          />
        </div>

        {/* Errors tab */}
        <div className={activeTab === "errors" ? "h-full" : "hidden h-full"}>
          <div className="space-y-2">
            {errorMessages.length > 0 ? (
              errorMessages.map((error) => (
                <div
                  key={error.id}
                  className={`flex items-start gap-3 px-3 py-2 rounded text-xs font-mono ${
                    error.source === "crash"
                      ? "bg-warning/20 text-warning-content border border-warning/30"
                      : "bg-error/10 text-error"
                  }`}
                >
                  <span className={`shrink-0 ${error.source === "crash" ? "text-warning/70" : "text-error/60"}`}>
                    {formatTime(error.timestamp)}
                  </span>
                  <span className={`badge badge-xs shrink-0 ${error.source === "crash" ? "badge-warning" : "badge-error"}`}>
                    {error.source === "crash" ? "server crash" : error.source}
                  </span>
                  <pre className="break-all whitespace-pre-wrap flex-1 overflow-x-auto max-h-24">{error.message}</pre>
                  {error.source === "crash" && onDebugCrashError && (
                    <button
                      onClick={onDebugCrashError}
                      className="btn btn-xs btn-primary shrink-0"
                    >
                      Debug with AI
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center text-base-content/50 py-4 text-xs flex items-center justify-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4 text-success"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                No errors detected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
