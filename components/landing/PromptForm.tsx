"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EXAMPLE_PROMPTS = [
  { icon: "🎧", text: "Customer service bot with billing & transfers" },
  { icon: "🍽️", text: "Restaurant reservation assistant" },
  { icon: "🔧", text: "Technical support troubleshooter" },
];

interface PromptFormProps {
  /** If true, user is already authenticated and we create project directly */
  authenticated?: boolean;
  /** Initial prompt value (e.g., from localStorage) */
  initialPrompt?: string;
  /** Called when project creation starts (for loading states) */
  onCreating?: () => void;
  /** Whether to show example prompts (default: true) */
  showExamples?: boolean;
}

export function PromptForm({ authenticated = false, initialPrompt = "", onCreating, showExamples = true }: PromptFormProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();
  const isCreatingRef = useRef(false);

  const createProject = useCallback(async (promptText: string) => {
    // Prevent duplicate project creation
    if (isCreatingRef.current) {
      console.log("[PromptForm] Project creation already in progress, skipping");
      return;
    }

    isCreatingRef.current = true;
    setIsLoading(true);
    onCreating?.();

    try {
      const name = promptText.slice(0, 50).trim() + (promptText.length > 50 ? "..." : "");

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          initial_prompt: promptText,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create project");
      }

      const { project } = await res.json();
      router.push(`/builder/${project.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsLoading(false);
      isCreatingRef.current = false; // Reset on error so user can retry
    }
  }, [router, onCreating]);

  // Auto-submit if we have an initial prompt and are authenticated
  useEffect(() => {
    if (authenticated && initialPrompt && !isCreatingRef.current) {
      createProject(initialPrompt);
    }
    // Only depend on authenticated and initialPrompt, not createProject
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, initialPrompt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (authenticated) {
      // User is authenticated, create project directly
      await createProject(prompt.trim());
    } else {
      setIsLoading(true);

      // Store the prompt for after authentication
      localStorage.setItem("pendingPrompt", prompt);

      // Check if user is already logged in
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // User is logged in, redirect to new project page with flag
        router.push("/projects/new?from=landing");
      } else {
        // User needs to log in first
        router.push("/login?redirectTo=/projects/new?from=landing");
      }
    }
  };

  const handleExampleClick = (text: string) => {
    setPrompt(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift), allow Shift+Enter for new lines
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !isLoading) {
        // Manually trigger form submission
        const form = e.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Textarea with glow effect */}
      <div className={`relative transition-all duration-300 ${isFocused ? "scale-[1.01]" : ""}`}>
        <div className={`absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl blur opacity-0 transition-opacity duration-300 ${isFocused ? "opacity-30" : ""}`} />
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the voice agent you want to build..."
            className="textarea textarea-bordered w-full h-40 text-lg resize-none bg-base-100 rounded-xl focus:outline-none focus:border-primary/50 transition-all"
            disabled={isLoading}
          />
          <div className="absolute bottom-3 right-4 flex items-center gap-3">
            <kbd className="kbd kbd-sm opacity-50">⇧↵ new line</kbd>
            <span className="text-sm text-base-content/40 tabular-nums">
              {prompt.length}
            </span>
          </div>
        </div>
      </div>

      {/* Example chips */}
      {showExamples && (
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-6">
          <span className="text-sm text-base-content/50 font-medium">Try:</span>
          {EXAMPLE_PROMPTS.map((example, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleExampleClick(example.text)}
              className="btn btn-ghost btn-sm gap-1.5 bg-base-200/50 hover:bg-base-200 border-0 rounded-full font-normal"
            >
              <span>{example.icon}</span>
              <span className="max-w-[180px] truncate">{example.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Submit button with animation */}
      <button
        type="submit"
        disabled={!prompt.trim() || isLoading}
        className={`btn btn-primary btn-lg w-full gap-3 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:shadow-none ${!showExamples ? "mt-6" : ""}`}
      >
        {isLoading ? (
          <>
            <span className="loading loading-spinner loading-md"></span>
            <span className="animate-pulse">Preparing your workspace...</span>
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
            <span className="text-lg">Build Agent</span>
            <kbd className="kbd kbd-sm bg-primary-content/20 border-primary-content/30 text-primary-content">
              Enter
            </kbd>
          </>
        )}
      </button>
    </form>
  );
}
