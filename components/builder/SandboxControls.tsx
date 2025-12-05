"use client";

import { useState } from "react";
import { SipPhone } from "./SipPhone";

type SandboxStatus = "stopped" | "starting" | "running" | "error";

interface SandboxControlsProps {
  webhookUrl: string | null;
  phoneNumber: string | null; // display_number format like "02041-34873-10"
  sandboxStatus: SandboxStatus;
  onStart: () => void;
  onStop: () => void;
  onDeploy: () => void;
  isDeploying?: boolean;
  showWebhookUrl?: boolean; // If true, show webhook URL (for debugging)
  hasUndeployedChanges?: boolean; // If true, show indicator that code has changed since last deploy
}

export function SandboxControls({
  webhookUrl,
  phoneNumber,
  sandboxStatus,
  onStart,
  onStop,
  onDeploy,
  isDeploying,
  showWebhookUrl = false,
  hasUndeployedChanges = false,
}: SandboxControlsProps) {
  const [copied, setCopied] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const handleCopyUrl = async () => {
    if (webhookUrl) {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyPhone = async () => {
    if (phoneNumber) {
      await navigator.clipboard.writeText(phoneNumber);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const statusColors: Record<SandboxStatus, string> = {
    stopped: "badge-ghost",
    starting: "badge-warning",
    running: "badge-success",
    error: "badge-error",
  };

  return (
    <div className="p-4 space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
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
              d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
            />
          </svg>
          Sandbox
        </h3>
        <span className={`badge badge-sm ${statusColors[sandboxStatus]}`}>
          {sandboxStatus === "starting" && (
            <span className="loading loading-spinner loading-xs mr-1"></span>
          )}
          {sandboxStatus}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {sandboxStatus === "stopped" || sandboxStatus === "error" ? (
          <button onClick={onStart} className="btn btn-primary btn-sm flex-1">
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
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
              />
            </svg>
            Start
          </button>
        ) : sandboxStatus === "running" ? (
          <>
            <button
              onClick={onDeploy}
              disabled={isDeploying}
              className={`btn btn-sm flex-1 relative ${
                hasUndeployedChanges ? "btn-warning" : "btn-primary"
              }`}
            >
              {isDeploying ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <>
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
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  {hasUndeployedChanges && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
                    </span>
                  )}
                </>
              )}
              Deploy
            </button>
            <button onClick={onStop} className="btn btn-ghost btn-sm">
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
                  d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                />
              </svg>
              Stop
            </button>
          </>
        ) : (
          <button disabled className="btn btn-sm flex-1">
            <span className="loading loading-spinner loading-xs"></span>
            Starting...
          </button>
        )}
      </div>

      {/* Phone Number - shown when sandbox is running */}
      {phoneNumber && sandboxStatus === "running" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-base-content/70">
            Your Phone Number
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={phoneNumber}
              readOnly
              className="input input-bordered input-sm flex-1 font-mono text-sm"
            />
            <button
              onClick={handleCopyPhone}
              className="btn btn-ghost btn-sm btn-square"
              title="Copy phone number"
            >
              {copiedPhone ? (
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
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
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
                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                  />
                </svg>
              )}
            </button>
          </div>
          {/* Browser-based calling for sipgate users */}
          <SipPhone phoneNumber={phoneNumber} disabled={isDeploying} />
          {isDeploying ? (
            <p className="text-xs text-base-content/50 flex items-center gap-1">
              <span className="loading loading-spinner loading-xs"></span>
              Deploying...
            </p>
          ) : hasUndeployedChanges ? (
            <p className="text-xs text-warning flex items-center gap-1">
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
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              You have undeployed changes
            </p>
          ) : (
            <p className="text-xs text-base-content/50">
              Call this number to test your voice agent
            </p>
          )}
        </div>
      )}

      {/* Webhook URL - only shown when SHOW_WEBHOOK_URL=true */}
      {showWebhookUrl && webhookUrl && sandboxStatus === "running" && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-base-content/70">
            Webhook URL (Debug)
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={webhookUrl}
              readOnly
              className="input input-bordered input-sm flex-1 font-mono text-xs"
            />
            <button
              onClick={handleCopyUrl}
              className="btn btn-ghost btn-sm btn-square"
              title="Copy URL"
            >
              {copied ? (
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
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
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
                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
