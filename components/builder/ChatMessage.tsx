"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  variant?: "default" | "agent"; // default = coding assistant, agent = voice agent
}

export function ChatMessage({ role, content, timestamp, variant = "default" }: ChatMessageProps) {
  const isAssistant = role === "assistant";

  // Choose bubble color based on variant
  const bubbleColor = isAssistant
    ? variant === "agent"
      ? "chat-bubble-secondary" // Purple/secondary color for voice agent
      : "chat-bubble-primary"   // Primary color for coding assistant
    : "";

  return (
    <div className={`chat ${isAssistant ? "chat-start" : "chat-end"}`}>
      <div className="chat-image avatar">
        <div className="w-8 h-8 rounded-full overflow-hidden">
          {isAssistant ? (
            <Image
              src={variant === "agent" ? "/avatar-agent.svg" : "/avatar-ai.svg"}
              alt={variant === "agent" ? "Voice Agent" : "AI Assistant"}
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
        {isAssistant ? (variant === "agent" ? "Voice Agent" : "FlowCommander") : "You"}
        {timestamp && <time className="ml-1">{timestamp}</time>}
      </div>
      <div
        className={`chat-bubble ${bubbleColor} text-sm`}
      >
        <ReactMarkdown
          components={{
            // Customize rendering to work well in chat bubbles
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            code: ({ node, inline, className, children, ...props }: any) => {
              // Check if this is inline code (no className means it's inline)
              const isInline = inline !== false && !className;

              if (isInline) {
                return (
                  <code className="font-mono" {...props}>
                    {children}
                  </code>
                );
              }

              return (
                <pre className="bg-black/10 text-base-content p-2 rounded text-xs overflow-x-auto my-2">
                  <code className="font-mono" {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 last:mb-0 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-1">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
