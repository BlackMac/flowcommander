"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { BuilderLayout } from "@/components/builder/BuilderLayout";
import { Sidebar } from "@/components/builder/Sidebar";
import { EditorPane } from "@/components/builder/EditorPane";
import { FlowDiagramPane } from "@/components/builder/FlowDiagramPane";
import { ChatArea } from "@/components/builder/ChatArea";
import { SandboxControls } from "@/components/builder/SandboxControls";
import { LogsPanel } from "@/components/builder/LogsPanel";
import type { Project, ChatMessage, WebhookEvent, PhoneNumber } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

type SandboxStatus = "stopped" | "starting" | "running" | "error";
type SaveStatus = "saved" | "editing" | "saving";

export default function BuilderPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<PhoneNumber | null>(null);
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>("stopped");
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [crashError, setCrashError] = useState<string | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [flowDiagramError, setFlowDiagramError] = useState<string | null>(null);

  // Flow diagram cache - persists across tab switches
  const [cachedMermaidCode, setCachedMermaidCode] = useState<string | null>(null);
  const [cachedMermaidHash, setCachedMermaidHash] = useState<string>("");

  // Show webhook URL only when env var is set (for debugging)
  const showWebhookUrl = process.env.NEXT_PUBLIC_SHOW_WEBHOOK_URL === "true";

  // Track when events were last cleared to filter out old events
  const eventsClearedAt = useRef<Date | null>(null);

  // Track last saved code to detect changes
  const lastSavedCodeRef = useRef<string>("");

  // Clear events handler that also sets the cleared timestamp
  const handleClearEvents = useCallback(() => {
    eventsClearedAt.current = new Date();
    setEvents([]);
  }, []);

  // Check if sandbox is actually running
  const checkSandboxStatus = useCallback(async () => {
    if (sandboxStatus !== "running" && sandboxStatus !== "starting") {
      return;
    }

    try {
      const res = await fetch(`/api/sandbox/status?projectId=${projectId}`);
      if (!res.ok) return;

      const status = await res.json();

      if (status.status === "stopped" || status.status === "error") {
        console.log("[Sandbox] Status check: sandbox is no longer running");
        setSandboxStatus("stopped");
        setWebhookUrl(null);

        // Update database to reflect stopped state
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandbox_id: null, webhook_url: null }),
        });
      } else if (status.status === "port_down") {
        // Server crashed but container is still running - fetch logs and auto-restart
        console.log("[Sandbox] Server crashed, fetching logs and auto-restarting...");

        // Fetch error logs before restarting
        try {
          const logsRes = await fetch(`/api/sandbox/logs?projectId=${projectId}`);
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            if (logsData.logs) {
              const allLines = logsData.logs.split("\n");
              // Extract the most relevant error info
              const errorLines = allLines
                .filter((line: string) =>
                  line.toLowerCase().includes("error") ||
                  line.toLowerCase().includes("exception") ||
                  line.toLowerCase().includes("typeerror") ||
                  line.toLowerCase().includes("referenceerror") ||
                  line.toLowerCase().includes("syntaxerror") ||
                  line.includes("at ") // stack trace lines
                )
                .slice(0, 15) // Limit to first 15 error lines
                .join("\n");

              if (errorLines) {
                setCrashError(errorLines);
              } else {
                // If no specific error lines found, show the last 10 lines of logs
                const lastLines = allLines.slice(-10).join("\n");
                setCrashError(lastLines || "Server crashed - no detailed logs available");
              }
            } else {
              setCrashError("Server crashed - unable to retrieve logs");
            }
          } else {
            setCrashError("Server crashed - failed to fetch logs");
          }
        } catch (logError) {
          console.error("[Sandbox] Failed to fetch crash logs:", logError);
          setCrashError("Server crashed - error fetching logs");
        }

        setIsDeploying(true);
        try {
          const deployRes = await fetch("/api/sandbox/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, code }),
          });
          if (deployRes.ok) {
            console.log("[Sandbox] Auto-restart successful");
          } else {
            console.error("[Sandbox] Auto-restart failed");
          }
        } finally {
          setIsDeploying(false);
        }
      }
    } catch (error) {
      console.error("Failed to check sandbox status:", error);
    }
  }, [projectId, sandboxStatus, code]);

  // Periodically check sandbox status (every 30 seconds)
  useEffect(() => {
    if (sandboxStatus !== "running") {
      return;
    }

    // Check immediately when status becomes "running"
    checkSandboxStatus();

    // Then check every 30 seconds
    const interval = setInterval(checkSandboxStatus, 30000);

    return () => clearInterval(interval);
  }, [sandboxStatus, checkSandboxStatus]);

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          router.push("/projects");
          return;
        }
        const { project } = await res.json();
        setProject(project);

        // Store phone number if present
        if (project.phone_number) {
          setPhoneNumber(project.phone_number);
        }

        // Add the initial prompt as the first message in chat
        if (project.initial_prompt) {
          const initialMessage: ChatMessage = {
            id: "initial-prompt",
            project_id: project.id,
            role: "user",
            content: project.initial_prompt,
            created_at: project.created_at,
          };
          setMessages((prev) => {
            // Only add if not already present
            if (!prev.some((m) => m.id === "initial-prompt")) {
              return [initialMessage, ...prev];
            }
            return prev;
          });
        }

        if (project.current_code) {
          setCode(project.current_code);
          lastSavedCodeRef.current = project.current_code;
        } else {
          // Generate initial code
          generateCode(project.initial_prompt);
        }

        if (project.webhook_url && project.sandbox_id) {
          // Show the proxy URL to users (not the direct E2B URL stored in DB)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          setWebhookUrl(`${appUrl}/api/webhook/${project.id}`);
          // Don't assume it's running - will be verified by checkSandboxStatus
          setSandboxStatus("running");
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
        router.push("/projects");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, router]);

  // Fetch chat messages
  useEffect(() => {
    const fetchMessages = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (data) {
        // Preserve the initial prompt message when setting fetched messages
        setMessages((prev) => {
          const initialPromptMsg = prev.find((m) => m.id === "initial-prompt");
          if (initialPromptMsg) {
            return [initialPromptMsg, ...data];
          }
          return data;
        });
      }
    };

    if (projectId) {
      fetchMessages();
    }
  }, [projectId]);

  // Fetch events function (used by both initial load and polling fallback)
  const fetchEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setEvents((prev) => {
        // Filter out events older than the clear timestamp
        const clearedAt = eventsClearedAt.current;
        const filteredData = clearedAt
          ? data.filter((e) => new Date(e.created_at) > clearedAt)
          : data;

        // Merge new events with existing, avoiding duplicates
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = filteredData.filter((e) => !existingIds.has(e.id));
        if (newEvents.length > 0) {
          console.log(`[Events] Polling found ${newEvents.length} new events`);
          return [...newEvents, ...prev].slice(0, 50);
        }
        return prev;
      });
    }
  }, [projectId]);

  // Subscribe to real-time events
  useEffect(() => {
    const supabase = createClient();

    // Fetch initial events (respecting cleared timestamp)
    const loadInitialEvents = async () => {
      const { data } = await supabase
        .from("webhook_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        // Filter out events older than the clear timestamp
        const clearedAt = eventsClearedAt.current;
        const filteredData = clearedAt
          ? data.filter((e) => new Date(e.created_at) > clearedAt)
          : data;
        setEvents(filteredData);
      }
    };

    loadInitialEvents();

    // Subscribe to new events
    const channel = supabase
      .channel(`webhook-events-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to ALL events for debugging
          schema: "public",
          table: "webhook_events",
        },
        (payload) => {
          console.log("[Realtime] Received postgres_changes event:", payload);
          // Filter client-side instead
          if (payload.eventType === "INSERT") {
            const newEvent = payload.new as WebhookEvent;
            if (newEvent.project_id === projectId) {
              // Only add if event is newer than clear timestamp
              const clearedAt = eventsClearedAt.current;
              if (!clearedAt || new Date(newEvent.created_at) > clearedAt) {
                setEvents((prev) => {
                  // Avoid duplicates (can happen if realtime and polling both pick up same event)
                  if (prev.some((e) => e.id === newEvent.id)) {
                    return prev;
                  }
                  return [newEvent, ...prev];
                });
              }
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log("[Realtime] Subscription status:", status);
        if (err) {
          console.error("[Realtime] Subscription error:", err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Polling fallback for events when sandbox is running
  // Realtime can be unreliable, so poll every 5 seconds as backup
  useEffect(() => {
    if (sandboxStatus !== "running") {
      return;
    }

    // Poll for new events every 5 seconds when sandbox is running
    const interval = setInterval(fetchEvents, 5000);

    return () => clearInterval(interval);
  }, [sandboxStatus, fetchEvents]);

  // Generate code from prompt
  const generateCode = async (prompt: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, projectId }),
      });

      if (!res.ok) throw new Error("Failed to generate code");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let generatedCode = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        generatedCode += chunk;
        // Strip any trailing closing fence while streaming
        const displayCode = generatedCode.replace(/\n?```\s*$/, "");
        setCode(displayCode);
      }

      // Final cleanup - remove any remaining markdown fences
      const cleanCode = generatedCode
        .replace(/^```(?:typescript|ts|javascript|js)?\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      setCode(cleanCode);
      // Code was saved by the generate API, so update our reference
      lastSavedCodeRef.current = cleanCode;
      setSaveStatus("saved");

      // Refetch project to get the updated name (extracted from code by the API)
      const projectRes = await fetch(`/api/projects/${projectId}`);
      if (projectRes.ok) {
        const { project: updatedProject } = await projectRes.json();
        setProject(updatedProject);
      }
    } catch (error) {
      console.error("Failed to generate code:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Save code to database
  const saveCode = useCallback(async (codeToSave: string) => {
    setSaveStatus("saving");
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_code: codeToSave }),
      });
      lastSavedCodeRef.current = codeToSave;
      setSaveStatus("saved");
    } catch (error) {
      console.error("Failed to save code:", error);
      // Revert to editing state on error so user knows save failed
      setSaveStatus("editing");
    }
  }, [projectId]);

  // Handle code changes (no auto-save, just track dirty state)
  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);

    // Check if code actually changed from last saved version
    if (newCode !== lastSavedCodeRef.current) {
      setSaveStatus("editing");
    } else {
      setSaveStatus("saved");
    }
  }, []);

  // Manual save handler
  const handleSave = useCallback(() => {
    if (saveStatus === "editing") {
      saveCode(code);
    }
  }, [saveStatus, saveCode, code]);

  // Warn user about unsaved changes when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "editing") {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we need to set returnValue
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // Handle chat message
  const handleSendMessage = async (message: string) => {
    setIsChatLoading(true);

    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      project_id: projectId,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          projectId,
          currentCode: code,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let responseText = "";
      let updatedCode = "";
      let isCodeSection = false;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        responseText += chunk;

        // Simple parsing - check if response contains code
        if (responseText.includes("```typescript")) {
          isCodeSection = true;
          const codeStart = responseText.indexOf("```typescript") + 13;
          const codeEnd = responseText.lastIndexOf("```");
          if (codeEnd > codeStart) {
            updatedCode = responseText.slice(codeStart, codeEnd).trim();
            setCode(updatedCode);
          }
        }
      }

      // Extract summary for chat display
      let chatContent = responseText;
      if (isCodeSection) {
        // Get text before the code block as the summary
        const summaryMatch = responseText.match(/^([\s\S]*?)```typescript/);
        chatContent = summaryMatch ? summaryMatch[1].trim() : "";
        if (!chatContent) {
          chatContent = "Code updated.";
        }
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        project_id: projectId,
        role: "assistant",
        content: chatContent,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Save if code was updated
      if (updatedCode) {
        await saveCode(updatedCode);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Sandbox controls
  const handleStartSandbox = async () => {
    setSandboxStatus("starting");
    try {
      const res = await fetch("/api/sandbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) throw new Error("Failed to create sandbox");

      const { webhookUrl: proxyUrl } = await res.json();
      setWebhookUrl(proxyUrl);

      // Note: sandbox_id and webhook_url are already set by the create API
      // No need to PATCH here - the create API handles it

      setSandboxStatus("running");

      // Now deploy code (database has the sandbox_id)
      setIsDeploying(true);
      try {
        await saveCode(code);
        const deployRes = await fetch("/api/sandbox/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, code }),
        });
        if (!deployRes.ok) {
          const errorData = await deployRes.json();
          console.error("Deploy failed:", errorData);
        } else {
          const result = await deployRes.json();
          console.log("Initial deploy result:", result);
          if (result.logs) {
            console.log("Initial deploy logs:", result.logs);
          }
        }
      } finally {
        setIsDeploying(false);
      }
    } catch (error) {
      console.error("Failed to start sandbox:", error);
      setSandboxStatus("error");
    }
  };

  const handleStopSandbox = async () => {
    try {
      await fetch("/api/sandbox/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      setSandboxStatus("stopped");
      setWebhookUrl(null);

      // Update project
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandbox_id: null, webhook_url: null }),
      });
    } catch (error) {
      console.error("Failed to stop sandbox:", error);
    }
  };

  const handleDeployCode = async () => {
    setIsDeploying(true);
    try {
      await saveCode(code);

      const res = await fetch("/api/sandbox/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, code }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Deploy failed:", errorData);
        throw new Error(errorData.error || "Failed to deploy code");
      }

      const result = await res.json();
      console.log("Deploy result:", result);
      if (result.logs) {
        console.log("Deploy logs:", result.logs);
      }
    } catch (error) {
      console.error("Failed to deploy code:", error);
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle sending crash error to chat for debugging
  const handleDebugCrashError = () => {
    if (crashError) {
      const debugMessage = `The server crashed with this error. Please help me fix it:\n\n\`\`\`\n${crashError}\n\`\`\``;
      handleSendMessage(debugMessage);
      setCrashError(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <BuilderLayout
      projectName={project?.name || "Untitled"}
      saveStatus={saveStatus}
      onSave={handleSave}
      sidebar={
        <Sidebar
          chatArea={
            <ChatArea
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isChatLoading}
            />
          }
          sandboxControls={
            <SandboxControls
              webhookUrl={webhookUrl}
              phoneNumber={phoneNumber?.display_number || null}
              sandboxStatus={sandboxStatus}
              onStart={handleStartSandbox}
              onStop={handleStopSandbox}
              onDeploy={handleDeployCode}
              isDeploying={isDeploying}
              showWebhookUrl={showWebhookUrl}
            />
          }
        />
      }
      editor={
        <EditorPane
          code={code}
          onChange={handleCodeChange}
          isLoading={isGenerating}
        />
      }
      flowDiagram={
        <FlowDiagramPane
          code={code}
          isLoading={isGenerating}
          cachedMermaidCode={cachedMermaidCode}
          cachedMermaidHash={cachedMermaidHash}
          onMermaidGenerated={(mermaid, hash) => {
            setCachedMermaidCode(mermaid);
            setCachedMermaidHash(hash);
          }}
        />
      }
      logsPanel={
        <LogsPanel
          projectId={projectId}
          events={events}
          sandboxRunning={sandboxStatus === "running"}
          onClearEvents={handleClearEvents}
          crashError={crashError}
          onClearCrashError={() => setCrashError(null)}
          onDebugCrashError={handleDebugCrashError}
        />
      }
    />
  );
}
