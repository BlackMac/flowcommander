"use client";

import { ReactNode, useState } from "react";
import { UserMenu } from "@/components/ui/UserMenu";
import { SettingsDialog } from "@/components/builder/SettingsDialog";

type SaveStatus = "saved" | "editing" | "saving";
type ActiveView = "code" | "flow";

interface BuilderLayoutProps {
  sidebar: ReactNode;
  editor: ReactNode;
  flowDiagram: ReactNode;
  logsPanel: ReactNode;
  projectName: string;
  saveStatus?: SaveStatus;
  onSave?: () => void;
}

export function BuilderLayout({
  sidebar,
  editor,
  flowDiagram,
  logsPanel,
  projectName,
  saveStatus = "saved",
  onSave,
}: BuilderLayoutProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("code");

  return (
    <div className="drawer lg:drawer-open h-screen">
      <input id="builder-drawer" type="checkbox" className="drawer-toggle" />

      {/* Main content - Editor + Logs */}
      <div className="drawer-content flex flex-col h-screen">
        {/* Navbar */}
        <div className="navbar bg-base-200 border-b border-base-300 px-4 shrink-0">
          <div className="flex-none lg:hidden">
            <label
              htmlFor="builder-drawer"
              aria-label="open sidebar"
              className="btn btn-square btn-ghost"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block h-6 w-6 stroke-current"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </label>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-lg font-semibold">{projectName}</span>
            {/* Save button with status */}
            <button
              onClick={onSave}
              disabled={saveStatus !== "editing"}
              className={`btn btn-sm gap-1.5 ${
                saveStatus === "editing"
                  ? "btn-warning"
                  : saveStatus === "saving"
                  ? "btn-ghost"
                  : "btn-ghost"
              }`}
            >
              {saveStatus === "saved" && (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 text-success"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  <span className="text-base-content/50">Saved</span>
                </>
              )}
              {saveStatus === "editing" && (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                    />
                  </svg>
                  Save
                </>
              )}
              {saveStatus === "saving" && (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  <span>Saving...</span>
                </>
              )}
            </button>

            {/* Code/Flow view toggle */}
            <div className="join">
              <button
                className={`join-item btn btn-sm ${
                  activeView === "code" ? "btn-active" : ""
                }`}
                onClick={() => setActiveView("code")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
                  />
                </svg>
                Code
              </button>
              <button
                className={`join-item btn btn-sm ${
                  activeView === "flow" ? "btn-active" : ""
                }`}
                onClick={() => setActiveView("flow")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                  />
                </svg>
                Flow
              </button>
            </div>
          </div>
          <div className="flex-none flex items-center gap-3">
            <div className="badge badge-outline">sipgate AI Flow</div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="btn btn-ghost btn-circle"
              aria-label="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </button>
            <UserMenu />
          </div>
        </div>

        {/* Editor/Flow area */}
        <div className="flex-1 overflow-hidden">
          {activeView === "code" ? editor : flowDiagram}
        </div>

        {/* Logs panel */}
        <div className="shrink-0">{logsPanel}</div>
      </div>

      {/* Sidebar */}
      <div className="drawer-side h-screen z-40">
        <label
          htmlFor="builder-drawer"
          aria-label="close sidebar"
          className="drawer-overlay"
        />
        <div className="bg-base-100 w-96 min-h-full flex flex-col border-r border-base-300">
          {sidebar}
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
