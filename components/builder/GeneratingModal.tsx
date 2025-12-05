"use client";

import { useEffect, useState } from "react";

const FUNNY_MESSAGES = [
  "🤖 Teaching AI the art of phone etiquette...",
  "📞 Dialing up some intelligence...",
  "🎭 Rehearsing conversation scenarios...",
  "🧠 Loading neural networks (the chatty kind)...",
  "☎️ Connecting synapses and phone lines...",
  "💬 Training on small talk and big ideas...",
  "🎪 Juggling callbacks and promises...",
  "🌟 Sprinkling some conversational magic...",
  "🔮 Predicting what callers will say (badly)...",
  "🎨 Painting with 1s, 0s, and pleasantries...",
  "🚀 Launching voice agent to production... in 3, 2, 1...",
  "🎯 Fine-tuning the 'how may I help you?' vibes...",
  "🧙‍♂️ Casting spell: sudo make-me-helpful...",
  "🎵 Composing a symphony of 'please hold'...",
  "🏗️ Building rapport (and also code)...",
  "🎓 Enrolling in Charm School for Robots...",
  "💎 Polishing responses until they shine...",
  "🌈 Adding a dash of personality...",
  "⚡ Charging conversation batteries...",
  "🎬 Directing: 'Action! Be helpful and friendly!'...",
  "🛠️ Tweaking the dials on empathy...",
  "📚 Reading 'How to Win Friends and Influence People'...",
  "🍵 Brewing a fresh pot of conversational tea...",
  "🕺 Teaching the bot to dance around tough questions...",
];

interface GeneratingModalProps {
  isOpen: boolean;
  statusMessages?: string[]; // Tool use status messages
}

export function GeneratingModal({ isOpen, statusMessages = [] }: GeneratingModalProps) {
  const [currentMessage, setCurrentMessage] = useState(FUNNY_MESSAGES[0]);

  useEffect(() => {
    if (!isOpen) return;

    // Pick a random message when opening
    const randomIndex = Math.floor(Math.random() * FUNNY_MESSAGES.length);
    setCurrentMessage(FUNNY_MESSAGES[randomIndex]);

    // Show a random message every 3 seconds
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * FUNNY_MESSAGES.length);
      setCurrentMessage(FUNNY_MESSAGES[randomIndex]);
    }, 3000);

    return () => clearInterval(interval);
    // Only run when isOpen changes to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen ? "open" : "closed"]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/80 backdrop-blur-sm">
      <div className="card bg-base-100 shadow-2xl w-full max-w-lg mx-4">
        <div className="card-body items-center text-center p-8">
          {/* Animated sparkle icon */}
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-xl bg-primary/30 animate-pulse" />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-20 h-20 text-primary relative animate-bounce"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
          </div>

          {/* Main heading */}
          <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            Crafting Your Agent
          </h2>

          {/* Status messages (tool use) */}
          {statusMessages.length > 0 ? (
            <div className="space-y-2 mb-6">
              {statusMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className="badge badge-lg badge-primary gap-2 animate-fade-in"
                >
                  {msg}
                </div>
              ))}
            </div>
          ) : (
            /* Random message */
            <p className="text-lg text-base-content/80 mb-6 min-h-[2rem] animate-fade-in" key={currentMessage}>
              {currentMessage}
            </p>
          )}

          {/* Progress indicator */}
          <div className="flex gap-2 items-center">
            <span className="loading loading-dots loading-lg text-primary"></span>
          </div>

          {/* Subtle hint */}
          <p className="text-sm text-base-content/50 mt-6">
            This might take 10-30 seconds. Worth the wait! ✨
          </p>
        </div>
      </div>
    </div>
  );
}
