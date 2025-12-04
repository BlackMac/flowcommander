import { Navbar } from "./Navbar";
import { PromptForm } from "./PromptForm";

export function Hero() {
  return (
    <div className="hero min-h-screen bg-gradient-to-br from-base-100 via-base-200 to-base-300 relative overflow-hidden">
      <Navbar />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="hero-content flex-col w-full max-w-5xl mx-auto py-16 relative z-10">
        {/* Header badge */}
        <div className="text-center mb-8">
          <div className="badge badge-primary badge-lg gap-2 px-4 py-3 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-content opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-content"></span>
            </span>
            Powered by sipgate AI Flow
          </div>
        </div>

        {/* Main heading with gradient text */}
        <h1 className="text-5xl md:text-7xl font-black text-center mb-6 tracking-tight">
          What will you{" "}
          <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
            build
          </span>{" "}
          today?
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-base-content/60 text-center max-w-2xl mb-12 leading-relaxed">
          Create AI-powered voice agents by describing what you want.
          <br />
          <span className="text-base-content/80 font-medium">FlowCommander generates the code and runs it for you.</span>
        </p>

        {/* Form card */}
        <div className="card bg-base-100 shadow-2xl w-full border border-base-300/50 backdrop-blur-sm">
          <div className="card-body p-6 md:p-8">
            <PromptForm />
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-12">
          <div className="badge badge-lg badge-ghost gap-2 py-4 px-5 bg-base-200/50 backdrop-blur-sm border-base-300 hover:bg-base-200 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              />
            </svg>
            <span className="font-medium">Voice-first</span>
          </div>
          <div className="badge badge-lg badge-ghost gap-2 py-4 px-5 bg-base-200/50 backdrop-blur-sm border-base-300 hover:bg-base-200 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-secondary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            <span className="font-medium">AI-generated code</span>
          </div>
          <div className="badge badge-lg badge-ghost gap-2 py-4 px-5 bg-base-200/50 backdrop-blur-sm border-base-300 hover:bg-base-200 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-accent"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
            <span className="font-medium">Instant deployment</span>
          </div>
        </div>
      </div>
    </div>
  );
}
