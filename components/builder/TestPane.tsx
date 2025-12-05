"use client";

import { useState } from "react";
import { SipPhone } from "./SipPhone";
import { ChatWithAgent } from "./ChatWithAgent";

type TestMode = "overview" | "call" | "chat";

interface TestPaneProps {
  phoneNumber: string | null;
  webhookUrl: string | null;
  projectName: string;
  sandboxStatus: "stopped" | "starting" | "running" | "error";
  disabled?: boolean;
}

export function TestPane({
  phoneNumber,
  webhookUrl,
  projectName,
  sandboxStatus,
  disabled = false,
}: TestPaneProps) {
  const [testMode, setTestMode] = useState<TestMode>("overview");

  return (
    <div className="h-full flex flex-col bg-base-100">
      {/* Header */}
      <div className="p-6 border-b border-base-300">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Test Your Agent</h2>
          {sandboxStatus === "running" && phoneNumber && (
            <div className="join">
              <button
                className={`join-item btn btn-sm ${
                  testMode === "overview" ? "btn-active" : ""
                }`}
                onClick={() => setTestMode("overview")}
              >
                Overview
              </button>
              <button
                className={`join-item btn btn-sm ${
                  testMode === "call" ? "btn-active" : ""
                }`}
                onClick={() => setTestMode("call")}
              >
                Call
              </button>
              <button
                className={`join-item btn btn-sm ${
                  testMode === "chat" ? "btn-active" : ""
                }`}
                onClick={() => setTestMode("chat")}
              >
                Chat
              </button>
            </div>
          )}
        </div>
        <p className="text-base-content/70 text-sm">
          {testMode === "overview"
            ? "Call or chat with your voice agent to test its functionality"
            : testMode === "call"
            ? "Make a browser-based test call to your agent"
            : "Chat with your agent via text (great for noisy environments)"}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {sandboxStatus === "running" && phoneNumber ? (
          testMode === "chat" ? (
            /* Chat Mode */
            <div className="h-full max-w-4xl mx-auto">
              <ChatWithAgent
                isOpen={true}
                onClose={() => setTestMode("overview")}
                webhookUrl={webhookUrl}
                projectName={projectName}
              />
            </div>
          ) : (
            /* Overview and Call Mode */
            <div className="max-w-2xl mx-auto space-y-6">
            {/* Phone Number Display */}
            <div className="card bg-base-200">
              <div className="card-body">
                <h3 className="card-title text-lg">Your Test Phone Number</h3>
                <p className="text-base-content/70 text-sm mb-4">
                  Call this number to test your voice agent
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={phoneNumber}
                    readOnly
                    className="input input-bordered flex-1 font-mono text-lg"
                  />
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(phoneNumber);
                    }}
                    className="btn btn-square"
                    title="Copy phone number"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Browser Calling */}
            <div className="card bg-base-200">
              <div className="card-body">
                <h3 className="card-title text-lg">Browser-Based Testing</h3>
                <p className="text-base-content/70 text-sm mb-4">
                  Test your agent directly from your browser without making a real call
                </p>
                <SipPhone
                  phoneNumber={phoneNumber}
                  webhookUrl={webhookUrl}
                  projectName={projectName}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Tips */}
            <div className="alert">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="stroke-info shrink-0 w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm">
                <div className="font-semibold mb-1">Testing Tips:</div>
                <ul className="list-disc list-inside space-y-1 text-base-content/70">
                  <li>Use the browser call feature for quick testing in noisy environments</li>
                  <li>The chat interface is great for debugging conversation flow</li>
                  <li>Real phone calls test the full voice experience</li>
                </ul>
              </div>
            </div>
          </div>
          )
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="alert alert-warning">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="stroke-current shrink-0 w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <div className="font-semibold">Sandbox Not Running</div>
                <div className="text-sm text-base-content/70">
                  Start your sandbox from the right panel to test your agent
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
