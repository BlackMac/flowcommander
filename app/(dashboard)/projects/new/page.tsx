"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PromptForm } from "@/components/landing/PromptForm";
import { Suspense } from "react";

function NewProjectContent() {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Only check for pending prompt if coming from landing page (has ?from=landing)
    const fromLanding = searchParams.get("from") === "landing";

    if (fromLanding) {
      const prompt = localStorage.getItem("pendingPrompt");
      if (prompt) {
        localStorage.removeItem("pendingPrompt");
        setPendingPrompt(prompt);
      }
    } else {
      // Clear any stale pending prompt when coming from elsewhere
      localStorage.removeItem("pendingPrompt");
    }

    setIsLoading(false);
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (isCreating || pendingPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-base-content/70">Creating your agent...</p>
          {/* Hidden form that auto-submits with the pending prompt */}
          {pendingPrompt && (
            <div className="hidden">
              <PromptForm
                authenticated={true}
                initialPrompt={pendingPrompt}
                onCreating={() => setIsCreating(true)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <div className="navbar bg-base-100 border-b border-base-300 px-6">
        <div className="flex-1">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <img
              src="/img/logo.svg"
              alt="FlowCommander"
              className="w-7 h-7"
              style={{ filter: "invert(36%) sepia(85%) saturate(2046%) hue-rotate(238deg) brightness(87%) contrast(93%)" }}
            />
            FlowCommander
          </Link>
        </div>
        <div className="flex-none">
          <button
            onClick={() => router.push("/projects")}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Create New Voice Agent</h1>
          <p className="text-base-content/60">
            Describe what you want your AI voice agent to do
          </p>
        </div>

        <PromptForm authenticated={true} showExamples={false} onCreating={() => setIsCreating(true)} />
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-base-200">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <NewProjectContent />
    </Suspense>
  );
}
