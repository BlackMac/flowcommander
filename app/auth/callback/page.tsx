"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();

      // Check for tokens in the URL fragment (hash)
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      // Determine where to redirect after auth
      const getRedirectUrl = () => {
        // Check if there's a pending prompt from the homepage
        const pendingPrompt = localStorage.getItem("pendingPrompt");
        if (pendingPrompt) {
          return "/projects/new";
        }
        return "/projects";
      };

      if (accessToken && refreshToken) {
        // Set the session using the tokens from the fragment
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("Failed to set session:", error);
          setError(error.message);
          return;
        }

        router.replace(getRedirectUrl());
        return;
      }

      // Check for code in query params (PKCE flow)
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Failed to exchange code:", error);
          setError(error.message);
          return;
        }

        router.replace(getRedirectUrl());
        return;
      }

      // No tokens or code found
      setError("No authentication tokens found");
    };

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <h2 className="card-title text-error">Authentication Failed</h2>
            <p>{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="btn btn-primary mt-4"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="flex flex-col items-center gap-4">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="text-base-content/70">Completing sign in...</p>
      </div>
    </div>
  );
}
