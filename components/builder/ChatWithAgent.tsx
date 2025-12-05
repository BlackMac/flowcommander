"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWithAgentProps {
  isOpen: boolean;
  onClose: () => void;
  webhookUrl: string | null;
  projectName: string;
  onAddEvent?: (eventType: string, data: any) => void;
}

export function ChatWithAgent({
  isOpen,
  onClose,
  webhookUrl,
  projectName,
  onAddEvent,
}: ChatWithAgentProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Generate session ID immediately on component creation (not in useEffect)
  const [sessionId, setSessionId] = useState<string>(() =>
    `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionStartedRef = useRef<boolean>(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start session when modal opens (only once)
  useEffect(() => {
    if (isOpen && webhookUrl && messages.length === 0 && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      handleStartSession();
    }
  }, [isOpen, webhookUrl]);

  const handleStartSession = async () => {
    if (!webhookUrl) return;

    setIsLoading(true);

    // Log session start event
    onAddEvent?.("session_start", {
      session_id: sessionId,
      type: "text_chat",
    });

    try {
      const response = await fetch("/api/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          event: "session_start",
          session: {
            id: sessionId,
            type: "text_chat",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          addMessage("assistant", data.text);
          // Log assistant response event
          onAddEvent?.("assistant_speak", {
            text: data.text,
            session_id: sessionId,
          });
        }
      } else {
        const error = await response.json();
        console.error("Start session failed:", error);
        addMessage("assistant", "Failed to start session. Make sure the agent is deployed.");
      }
    } catch (error) {
      console.error("Failed to start session:", error);
      addMessage("assistant", "Failed to connect to agent. Make sure it's deployed and running.");
    } finally {
      setIsLoading(false);
    }
  };

  const addMessage = (role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role,
        content,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || !webhookUrl || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    addMessage("user", userMessage);

    // Log user speak event
    onAddEvent?.("user_speak", {
      text: userMessage,
      session_id: sessionId,
    });

    setIsLoading(true);
    try {
      const response = await fetch("/api/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          event: "user_speak",
          session: {
            id: sessionId,
            type: "text_chat",
          },
          text: userMessage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          addMessage("assistant", data.text);
          // Log assistant response event
          onAddEvent?.("assistant_speak", {
            text: data.text,
            session_id: sessionId,
          });
        }

        // Check if call should end
        if (data.type === "hangup") {
          addMessage("assistant", "_Call ended_");
          onAddEvent?.("session_end", {
            session_id: sessionId,
            reason: "hangup",
          });
          setIsLoading(false);
          return;
        }
      } else {
        addMessage("assistant", "Failed to get response from agent.");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      addMessage("assistant", "Error communicating with agent.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRestart = async () => {
    // Send session end event for current session
    if (webhookUrl && sessionId) {
      await fetch("/api/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          event: "session_end",
          session: {
            id: sessionId,
            type: "text_chat",
          },
        }),
      }).catch(() => {
        // Ignore errors
      });
    }

    // Reset state
    setMessages([]);
    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    sessionStartedRef.current = false;

    // Start new session immediately
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          event: "session_start",
          session: {
            id: newSessionId,
            type: "text_chat",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          addMessage("assistant", data.text);
        }
      }
    } catch (error) {
      console.error("Failed to restart session:", error);
    } finally {
      setIsLoading(false);
      sessionStartedRef.current = true;
    }
  };

  const handleClose = () => {
    // Send session end event
    if (webhookUrl && sessionId) {
      fetch("/api/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          event: "session_end",
          session: {
            id: sessionId,
            type: "text_chat",
          },
        }),
      }).catch(() => {
        // Ignore errors on close
      });
    }

    setMessages([]);
    setSessionId(`chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    sessionStartedRef.current = false; // Reset for next session
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="bg-base-100 rounded-lg border border-base-300 shadow-lg w-full h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-base-300 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-lg">Chat with Agent</h3>
          <p className="text-xs text-base-content/60">{projectName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRestart}
            className="btn btn-ghost btn-sm btn-square"
            title="Restart conversation"
            disabled={isLoading}
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </button>
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-square"
            title="Close chat"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center text-base-content/50 py-8">
              <p className="text-sm">
                Test your voice agent via text chat
              </p>
              <p className="text-xs mt-2">
                Great for noisy environments or quick testing
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
              variant="agent"
            />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-secondary">
                  <span className="loading loading-dots loading-sm"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

      {/* Input */}
      <div className="p-4 border-t border-base-300 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="input input-bordered flex-1"
            disabled={isLoading || !webhookUrl}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !webhookUrl}
            className="btn btn-primary"
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
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </div>
        {!webhookUrl && (
          <p className="text-xs text-warning mt-2">
            Agent must be running to chat
          </p>
        )}
      </div>
    </div>
  );
}
