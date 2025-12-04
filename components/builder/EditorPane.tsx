"use client";

import Editor, { OnMount, BeforeMount } from "@monaco-editor/react";
import { useRef } from "react";
import type { editor } from "monaco-editor";
import { useTheme } from "@/contexts/ThemeContext";

// Type declarations for the FlowCommander runtime that gets injected at deploy time
const FLOWCOMMANDER_TYPE_DEFS = `
// FlowCommander Runtime Types (auto-injected at deploy time)

/**
 * Message format for LLM conversations.
 * This type is automatically available in your code - no import needed.
 */
declare interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call the LLM to generate a response.
 * This function is automatically available in your code - no import needed.
 * @param messages - Array of messages in the conversation
 * @returns The LLM's response text
 */
declare function callLLM(messages: LLMMessage[]): Promise<string>;

// sipgate AI Flow SDK types
declare module "@sipgate/ai-flow-sdk" {
  export interface AiFlowSession {
    id: string;
    account_id: string;
    phone_number: string;
    direction?: "inbound" | "outbound";
    from_phone_number: string;
    to_phone_number: string;
  }

  export interface AiFlowEventSessionStart {
    type: "session_start";
    session: AiFlowSession;
  }

  export interface AiFlowEventUserSpeak {
    type: "user_speak";
    text: string;
    session: AiFlowSession;
  }

  export interface AiFlowEventUserBargeIn {
    type: "user_barge_in";
    text: string;
    session: AiFlowSession;
  }

  export interface AiFlowEventAssistantSpeak {
    type: "assistant_speak";
    text?: string;
    session: AiFlowSession;
  }

  export interface AiFlowEventAssistantSpeechEnded {
    type: "assistant_speech_ended";
    session: AiFlowSession;
  }

  export interface AiFlowEventSessionEnd {
    type: "session_end";
    reason?: string;
    session: AiFlowSession;
  }

  export enum BargeInStrategy {
    NONE = "none",
    INTERRUPT = "interrupt",
  }

  export enum TtsProvider {
    AZURE = "azure",
  }

  export interface TtsConfig {
    provider?: TtsProvider;
    language?: string;
    voice?: string;
  }

  export interface BargeInConfig {
    strategy: BargeInStrategy;
  }

  export interface SpeakAction {
    type: "speak";
    text: string;
    tts?: TtsConfig;
    barge_in?: BargeInConfig;
    end_of_conversation?: boolean;
  }

  export interface TransferAction {
    type: "transfer";
    destination: string;
  }

  export interface HangupAction {
    type: "hangup";
  }

  export type AiFlowAction = SpeakAction | TransferAction | HangupAction | string;

  export interface AiFlowAssistantConfig {
    debug?: boolean;
    onSessionStart?: (event: AiFlowEventSessionStart) => Promise<AiFlowAction | void>;
    onUserSpeak?: (event: AiFlowEventUserSpeak) => Promise<AiFlowAction | void>;
    onUserBargeIn?: (event: AiFlowEventUserBargeIn) => Promise<AiFlowAction | void>;
    onAssistantSpeak?: (event: AiFlowEventAssistantSpeak) => Promise<void>;
    onAssistantSpeechEnded?: (event: AiFlowEventAssistantSpeechEnded) => Promise<void>;
    onSessionEnd?: (event: AiFlowEventSessionEnd) => Promise<void>;
  }

  export interface AiFlowAssistantInstance {
    express(): (req: any, res: any) => void;
  }

  export const AiFlowAssistant: {
    create(config: AiFlowAssistantConfig): AiFlowAssistantInstance;
  };
}
`;

interface EditorPaneProps {
  code: string;
  onChange: (code: string) => void;
  isLoading?: boolean;
}

export function EditorPane({ code, onChange, isLoading }: EditorPaneProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { editorTheme } = useTheme();

  const handleEditorWillMount: BeforeMount = (monaco) => {
    // Define custom themes
    monaco.editor.defineTheme("solarized-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "839496", background: "002b36" },
        { token: "comment", foreground: "586e75", fontStyle: "italic" },
        { token: "keyword", foreground: "859900" },
        { token: "string", foreground: "2aa198" },
        { token: "number", foreground: "d33682" },
        { token: "type", foreground: "b58900" },
        { token: "class", foreground: "b58900" },
        { token: "function", foreground: "268bd2" },
        { token: "variable", foreground: "839496" },
        { token: "constant", foreground: "cb4b16" },
        { token: "parameter", foreground: "839496" },
        { token: "property", foreground: "839496" },
        { token: "punctuation", foreground: "839496" },
        { token: "operator", foreground: "859900" },
        { token: "delimiter", foreground: "839496" },
        { token: "tag", foreground: "268bd2" },
        { token: "attribute.name", foreground: "93a1a1" },
        { token: "attribute.value", foreground: "2aa198" },
      ],
      colors: {
        "editor.background": "#002b36",
        "editor.foreground": "#839496",
        "editor.lineHighlightBackground": "#073642",
        "editor.selectionBackground": "#073642",
        "editorCursor.foreground": "#839496",
        "editorWhitespace.foreground": "#073642",
        "editorLineNumber.foreground": "#586e75",
        "editorLineNumber.activeForeground": "#839496",
        "editor.selectionHighlightBackground": "#073642",
        "editorIndentGuide.background": "#073642",
        "editorIndentGuide.activeBackground": "#586e75",
        "editorBracketMatch.background": "#073642",
        "editorBracketMatch.border": "#586e75",
      },
    });

    monaco.editor.defineTheme("solarized-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "", foreground: "657b83", background: "fdf6e3" },
        { token: "comment", foreground: "93a1a1", fontStyle: "italic" },
        { token: "keyword", foreground: "859900" },
        { token: "string", foreground: "2aa198" },
        { token: "number", foreground: "d33682" },
        { token: "type", foreground: "b58900" },
        { token: "class", foreground: "b58900" },
        { token: "function", foreground: "268bd2" },
        { token: "variable", foreground: "657b83" },
        { token: "constant", foreground: "cb4b16" },
        { token: "parameter", foreground: "657b83" },
        { token: "property", foreground: "657b83" },
        { token: "punctuation", foreground: "657b83" },
        { token: "operator", foreground: "859900" },
        { token: "delimiter", foreground: "657b83" },
        { token: "tag", foreground: "268bd2" },
        { token: "attribute.name", foreground: "586e75" },
        { token: "attribute.value", foreground: "2aa198" },
      ],
      colors: {
        "editor.background": "#fdf6e3",
        "editor.foreground": "#657b83",
        "editor.lineHighlightBackground": "#eee8d5",
        "editor.selectionBackground": "#eee8d5",
        "editorCursor.foreground": "#657b83",
        "editorWhitespace.foreground": "#eee8d5",
        "editorLineNumber.foreground": "#93a1a1",
        "editorLineNumber.activeForeground": "#657b83",
        "editor.selectionHighlightBackground": "#eee8d5",
        "editorIndentGuide.background": "#eee8d5",
        "editorIndentGuide.activeBackground": "#93a1a1",
        "editorBracketMatch.background": "#eee8d5",
        "editorBracketMatch.border": "#93a1a1",
      },
    });

    // Configure TypeScript compiler options
    // NOTE: Do NOT set the 'lib' option - it's broken in Monaco and will cause
    // Map, Set, Promise, etc. to show as errors. Without 'lib', Monaco uses
    // its default libs which include all ES features.
    // See: https://github.com/microsoft/TypeScript/issues/51485
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
    });

    // Ensure default libs are loaded (includes Map, Set, Promise, etc.)
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

    // Add FlowCommander runtime type definitions
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      FLOWCOMMANDER_TYPE_DEFS,
      "file:///flowcommander-runtime.d.ts"
    );

    // Only disable module resolution errors - we handle imports at runtime
    // Keep all syntax validation enabled for proper error checking
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      // Only ignore module-related errors that we handle at runtime
      diagnosticCodesToIgnore: [
        2307, // Cannot find module (imports handled at runtime)
        2304, // Cannot find name (for runtime-injected globals like TtsProvider)
        7016, // Could not find declaration file
      ],
    });
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || "");
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-base-100">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-base-content/70">Generating your agent...</p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      defaultLanguage="typescript"
      value={code}
      onChange={handleEditorChange}
      beforeMount={handleEditorWillMount}
      onMount={handleEditorMount}
      theme={editorTheme}
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        fontFamily: "var(--font-geist-mono), monospace",
        lineNumbers: "on",
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        tabSize: 2,
        formatOnPaste: true,
        formatOnType: true,
      }}
      loading={
        <div className="h-full w-full flex items-center justify-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    />
  );
}
