"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";

interface FlowDiagramPaneProps {
  code: string;
  isLoading?: boolean;
  onError?: (error: string | null) => void;
  // Cache props - lifted to parent to persist across tab switches
  cachedMermaidCode?: string | null;
  cachedMermaidHash?: string;
  onMermaidGenerated?: (mermaid: string, hash: string) => void;
}

// Simple hash function for comparing code changes
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

export function FlowDiagramPane({
  code,
  isLoading,
  onError,
  cachedMermaidCode,
  cachedMermaidHash = "",
  onMermaidGenerated,
}: FlowDiagramPaneProps) {
  // Use cached values if available, otherwise use local state
  const [localMermaidCode, setLocalMermaidCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localGeneratedForHash, setLocalGeneratedForHash] = useState<string>("");

  // Use cached values from parent if available
  const mermaidCode = cachedMermaidCode ?? localMermaidCode;
  const generatedForHash = cachedMermaidHash || localGeneratedForHash;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);

  // Pan and zoom state - start at 2x scale
  const [scale, setScale] = useState(2);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const hasInitializedPosition = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });

  // Initialize mermaid once
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis",
      },
      securityLevel: "loose",
    });
  }, []);

  // Check if current code differs from what we generated the diagram for
  const currentHash = hashCode(code);
  const isStale = mermaidCode !== null && currentHash !== generatedForHash;

  // Generate diagram function
  const generateDiagram = useCallback(async () => {
    if (!code.trim()) return;

    const codeHash = hashCode(code);

    // Don't regenerate if code hasn't changed since last generation
    if (codeHash === generatedForHash && mermaidCode) {
      return;
    }

    setIsGenerating(true);
    onError?.(null);

    try {
      const res = await fetch("/api/flow-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate diagram");
      }

      const { mermaid: diagram } = await res.json();
      // Update both local state and notify parent for caching
      setLocalMermaidCode(diagram);
      setLocalGeneratedForHash(codeHash);
      onMermaidGenerated?.(diagram, codeHash);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to generate flow diagram");
    } finally {
      setIsGenerating(false);
    }
  }, [code, generatedForHash, mermaidCode, onError, onMermaidGenerated]);

  // Generate on first mount or when code changes (only if we don't have a diagram yet or code changed)
  useEffect(() => {
    if (!code.trim()) return;

    const codeHash = hashCode(code);

    // Only auto-generate if we have no diagram yet, or if code changed since last generation
    if (!mermaidCode || codeHash !== generatedForHash) {
      // Small delay to batch rapid changes
      const timeout = setTimeout(() => {
        generateDiagram();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [code, mermaidCode, generatedForHash, generateDiagram]);

  // Render Mermaid diagram
  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;

    const renderDiagram = async () => {
      try {
        // Increment render ID to ensure unique element ID
        renderIdRef.current += 1;
        const elementId = `flow-diagram-${renderIdRef.current}`;

        const { svg } = await mermaid.render(elementId, mermaidCode);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        onError?.("Failed to render diagram. The generated diagram may have invalid syntax.");
      }
    };

    renderDiagram();
  }, [mermaidCode, onError]);

  // Center diagram on initial render
  useEffect(() => {
    if (!mermaidCode || !containerRef.current || hasInitializedPosition.current) return;

    // Wait for the SVG to be rendered and have dimensions
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const diagramRect = containerRef.current.getBoundingClientRect();
        // diagramRect is at current scale, so just offset by half its dimensions
        setPosition({
          x: -diagramRect.width / 2,
          y: -diagramRect.height / 2,
        });
        hasInitializedPosition.current = true;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [mermaidCode]);

  // Manual refresh handler
  const handleRefresh = () => {
    setLocalGeneratedForHash(""); // Force regeneration
    generateDiagram();
  };

  // Reset view handler - centers the diagram in the viewport at 2x scale
  const handleResetView = () => {
    const targetScale = 2;
    if (containerRef.current) {
      const diagramRect = containerRef.current.getBoundingClientRect();
      // Get natural size by dividing current dimensions by current scale
      const naturalWidth = diagramRect.width / scale;
      const naturalHeight = diagramRect.height / scale;
      // At target scale, offset by half the scaled dimensions
      const scaledWidth = naturalWidth * targetScale;
      const scaledHeight = naturalHeight * targetScale;
      setPosition({
        x: -scaledWidth / 2,
        y: -scaledHeight / 2,
      });
    } else {
      setPosition({ x: 0, y: 0 });
    }
    setScale(targetScale);
  };

  // Zoom toward viewport center (for toolbar buttons)
  const zoomToCenter = useCallback((newScale: number) => {
    // When zooming toward center, the position scales proportionally
    // This keeps the center point of the view fixed
    const scaleRatio = newScale / scale;
    setPosition({
      x: position.x * scaleRatio,
      y: position.y * scaleRatio,
    });
    setScale(newScale);
  }, [scale, position]);

  // Mouse down - start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionStart.current = { ...position };
    e.preventDefault();
  }, [position]);

  // Mouse move - drag
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({
      x: positionStart.current.x + dx,
      y: positionStart.current.y + dy,
    });
  }, [isDragging]);

  // Mouse up - stop dragging
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse leave - stop dragging
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel - zoom toward mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 5);

    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      // Mouse position relative to viewport
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // The diagram origin is at viewport center (50%, 50%) plus our position offset
      const viewportCenterX = rect.width / 2;
      const viewportCenterY = rect.height / 2;

      // Current diagram origin in viewport coordinates
      const diagramOriginX = viewportCenterX + position.x;
      const diagramOriginY = viewportCenterY + position.y;

      // Mouse position relative to diagram origin (in diagram space before scaling)
      const mouseRelX = (mouseX - diagramOriginX) / scale;
      const mouseRelY = (mouseY - diagramOriginY) / scale;

      // After zoom, we want the same diagram point to be under the mouse
      // New diagram origin position = mousePos - mouseRel * newScale
      const newDiagramOriginX = mouseX - mouseRelX * newScale;
      const newDiagramOriginY = mouseY - mouseRelY * newScale;

      // Convert back to position offset (relative to viewport center)
      setPosition({
        x: newDiagramOriginX - viewportCenterX,
        y: newDiagramOriginY - viewportCenterY,
      });
    }

    setScale(newScale);
  }, [scale, position]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-base-100">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-base-content/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!code.trim()) {
    return (
      <div className="h-full flex items-center justify-center bg-base-100">
        <p className="text-base-content/50">No code to visualize</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-base-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-base-300 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Flow Diagram</h3>
          {isStale && !isGenerating && (
            <span className="badge badge-warning badge-sm">Outdated</span>
          )}
          {isGenerating && (
            <span className="badge badge-info badge-sm">
              <span className="loading loading-spinner loading-xs mr-1"></span>
              Generating...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <span className="text-xs text-base-content/50 mr-2">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => zoomToCenter(Math.min(scale * 1.2, 5))}
            className="btn btn-ghost btn-sm btn-square"
            title="Zoom in"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button
            onClick={() => zoomToCenter(Math.max(scale * 0.8, 0.1))}
            className="btn btn-ghost btn-sm btn-square"
            title="Zoom out"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            </svg>
          </button>
          <button
            onClick={handleResetView}
            className="btn btn-ghost btn-sm btn-square"
            title="Reset view"
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
                d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
              />
            </svg>
          </button>
          <div className="divider divider-horizontal mx-1 h-4"></div>
          <button
            onClick={handleRefresh}
            disabled={isGenerating}
            className="btn btn-ghost btn-sm btn-square"
            title="Refresh diagram"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Diagram content */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {isGenerating && !mermaidCode ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="mt-4 text-base-content/70">Generating flow diagram...</p>
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="absolute"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "0 0",
              left: "50%",
              top: "50%",
            }}
          />
        )}
      </div>
    </div>
  );
}
