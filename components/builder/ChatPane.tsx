"use client";

import { useState } from "react";
import { ChatWithAgent } from "./ChatWithAgent";

interface ChatPaneProps {
  phoneNumber: string | null;
  webhookUrl: string | null;
  projectName: string;
  sandboxStatus: "stopped" | "starting" | "running" | "error";
}

export function ChatPane({
  phoneNumber,
  webhookUrl,
  projectName,
  sandboxStatus,
}: ChatPaneProps) {
  // Generate a unique key when component mounts to force new session
  const [chatKey] = useState(() => Date.now());

  return (
    <div className="h-full flex flex-col bg-base-100">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {sandboxStatus === "running" && phoneNumber ? (
          <div className="h-full max-w-4xl mx-auto">
            <ChatWithAgent
              key={chatKey}
              isOpen={true}
              onClose={() => {}}
              webhookUrl={webhookUrl}
              projectName={projectName}
            />
          </div>
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
