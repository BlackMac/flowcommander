"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/projects";
  const error = searchParams.get("error");

  const handleGitHubLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      console.error("Login error:", error.message);
    }
  };

  const handleSipgateLogin = () => {
    window.location.href = `/api/auth/sipgate?redirectTo=${encodeURIComponent(redirectTo)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 flex flex-col">
      {/* Navbar */}
      <div className="navbar bg-transparent px-6 absolute top-0 left-0 right-0 z-10">
        <div className="flex-1">
          <Link href="/" className="btn btn-ghost text-xl font-bold gap-2">
            <img
              src="/img/logo.svg"
              alt="FlowCommander"
              className="w-7 h-7"
              style={{ filter: "invert(36%) sepia(85%) saturate(2046%) hue-rotate(238deg) brightness(87%) contrast(93%)" }}
            />
            FlowCommander
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <div className="hero flex-1">
        <div className="hero-content flex-col lg:flex-row-reverse gap-12 py-12">
          {/* Feature highlights */}
          <div className="hidden lg:block max-w-md">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 rounded-xl p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-primary">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">AI-Powered Generation</h3>
                  <p className="text-base-content/60">Describe your agent in plain English and watch it come to life</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-secondary/10 rounded-xl p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-secondary">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Live Code Editor</h3>
                  <p className="text-base-content/60">Full TypeScript editor with syntax highlighting and IntelliSense</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-accent/10 rounded-xl p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-accent">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Instant Testing</h3>
                  <p className="text-base-content/60">Deploy to a sandbox and test with real sipgate calls</p>
                </div>
              </div>
            </div>
          </div>

          {/* Login Card */}
          <div className="card bg-base-100 w-full max-w-sm shadow-2xl border border-base-300">
            <div className="card-body">
              {/* Header */}
              <div className="text-center mb-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary mb-4 p-3">
                  <img
                    src="/img/logo.svg"
                    alt="FlowCommander"
                    className="w-full h-full"
                    style={{ filter: "brightness(0) invert(1)" }}
                  />
                </div>
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-base-content/60 mt-1">Sign in to continue building</p>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="alert alert-error shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm">
                    {error === "sipgate_not_configured"
                      ? "Sipgate login is not configured"
                      : error === "invalid_state"
                      ? "Session expired. Please try again."
                      : `Authentication failed: ${error.replace(/_/g, " ")}`}
                  </span>
                </div>
              )}

              {/* Login Buttons */}
              <div className="form-control mt-4 w-full">
                <button
                  onClick={handleSipgateLogin}
                  className="btn btn-primary w-full gap-3 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Continue with sipgate
                </button>

                <div className="divider text-xs text-base-content/40 my-2">OR</div>

                <button
                  onClick={handleGitHubLogin}
                  className="btn btn-outline w-full gap-3 hover:bg-neutral hover:border-neutral"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-base-300">
                <div className="flex items-center justify-center gap-2 text-xs text-base-content/50">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <span>Secure authentication via OAuth 2.0</span>
                </div>
                <p className="text-center text-xs text-base-content/40 mt-3">
                  By signing in, you agree to our{" "}
                  <a href="#" className="link link-hover">Terms</a> and{" "}
                  <a href="#" className="link link-hover">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-secondary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-accent/3 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-200 via-base-100 to-base-200">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
