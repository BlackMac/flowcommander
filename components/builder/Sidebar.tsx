"use client";

import { ReactNode } from "react";

interface SidebarProps {
  chatArea: ReactNode;
  sandboxControls: ReactNode;
}

export function Sidebar({ chatArea, sandboxControls }: SidebarProps) {
  return (
    <div className="relative h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-base-300 shrink-0">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <img
            src="/img/logo.svg"
            alt="FlowCommander"
            className="w-5 h-5"
            style={{ filter: "invert(36%) sepia(85%) saturate(2046%) hue-rotate(238deg) brightness(87%) contrast(93%)" }}
          />
          FlowCommander
        </h2>
      </div>

      {/* Chat area - takes remaining space, with padding for fixed controls */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 pb-48">
        {chatArea}
      </div>

      {/* Sandbox controls - fixed to bottom of viewport, same height as logs panel (h-48) */}
      <div className="fixed bottom-0 left-0 w-96 h-48 border-t border-r border-base-300 bg-base-200 overflow-y-auto">
        {sandboxControls}
      </div>
    </div>
  );
}
