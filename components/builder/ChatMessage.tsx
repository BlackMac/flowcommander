"use client";

import Image from "next/image";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={`chat ${isAssistant ? "chat-start" : "chat-end"}`}>
      <div className="chat-image avatar">
        <div className="w-8 h-8 rounded-full overflow-hidden">
          {isAssistant ? (
            <Image
              src="/avatar-ai.svg"
              alt="AI Assistant"
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          ) : (
            <Image
              src="/avatar-user.svg"
              alt="User"
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      </div>
      <div className="chat-header text-xs opacity-50 mb-1">
        {isAssistant ? "FlowCommander" : "You"}
        {timestamp && <time className="ml-1">{timestamp}</time>}
      </div>
      <div
        className={`chat-bubble ${isAssistant ? "chat-bubble-primary" : ""} text-sm`}
      >
        {content}
      </div>
    </div>
  );
}
