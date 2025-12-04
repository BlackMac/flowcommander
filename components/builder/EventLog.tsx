"use client";

import { useState } from "react";
import type { WebhookEvent } from "@/types/database";

interface EventLogProps {
  events: WebhookEvent[];
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  session_start: "badge-success",
  session_end: "badge-error",
  user_speak: "badge-info",
  user_barge_in: "badge-warning",
  assistant_speak: "badge-primary",
  assistant_speech_ended: "badge-secondary",
};

export function EventLog({ events }: EventLogProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center text-base-content/50 py-4 text-xs">
        No events yet. Events will appear when calls come in.
      </div>
    );
  }

  const toggleExpand = (eventId: string) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  return (
    <div className="space-y-1">
      {events.map((event) => (
        <div
          key={event.id}
          className="text-xs hover:bg-base-300 rounded cursor-pointer"
          onClick={() => toggleExpand(event.id)}
        >
          <div className="flex items-center gap-2 p-1.5">
            <span
              className={`badge badge-xs shrink-0 ${EVENT_TYPE_COLORS[event.event_type] || "badge-ghost"}`}
            >
              {event.event_type}
            </span>
            <span className="text-base-content/70 flex-1 min-w-0 truncate font-mono">
              {event.event_data && typeof event.event_data === "object"
                ? JSON.stringify(event.event_data)
                : "—"}
            </span>
            <time className="text-base-content/40 shrink-0">
              {new Date(event.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`w-3 h-3 shrink-0 text-base-content/40 transition-transform ${expandedEvent === event.id ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
          {expandedEvent === event.id && event.event_data && (
            <pre className="p-2 bg-base-300 rounded-b text-xs font-mono whitespace-pre-wrap break-all mx-1 mb-1">
              {JSON.stringify(event.event_data, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
