# CLAUDE.md

This file provides guidance to Claude Code when working on this project.

## Project Overview

FlowCommander is an AI-powered voice agent code builder for sipgate AI Flow. Users describe a voice agent in natural language, Claude generates the code, and users can test it via browser-based calling.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS 4 + DaisyUI 5 (light mode default)
- **Database/Auth:** Supabase (PostgreSQL + Auth with GitHub/sipgate OAuth)
- **AI:** Anthropic Claude Sonnet 4 for code generation
- **Sandbox:** E2B for isolated Node.js code execution
- **Editor:** Monaco Editor for code editing
- **VoIP:** SIP.js for browser-based calling + sipgate OAuth
- **Diagrams:** Mermaid.js for flow visualization

## Key Commands

```bash
npm run dev      # Start dev server on http://localhost:3000
npm run build    # Build for production
npm start        # Run production build
npm run lint     # Run ESLint
```

## Project Structure

```
app/
├── (auth)/                  # Login, OAuth callbacks
├── (dashboard)/             # Protected routes (builder, projects)
│   ├── builder/[projectId]/ # Main IDE page
│   └── projects/            # Project list
├── api/                     # Backend routes
│   ├── auth/               # Auth handlers (Supabase, sipgate)
│   ├── chat/               # Streaming chat refinement
│   ├── generate/           # Streaming code generation
│   ├── llm/[projectId]/    # LLM proxy for sandboxes
│   ├── projects/           # Project CRUD
│   ├── sandbox/            # Sandbox lifecycle
│   ├── webhook/            # Incoming webhook handlers
│   ├── sip/               # SIP credentials
│   └── flow-diagram/       # Mermaid diagram generation
└── page.tsx                 # Landing page

components/
├── builder/                 # Builder UI (EditorPane, ChatArea, etc.)
├── projects/                # Project management
├── landing/                 # Landing page
└── ui/                      # Reusable components

lib/
├── anthropic/              # Claude client + prompts
├── supabase/               # Database clients (browser + server)
├── sandbox/                # E2B sandbox management
├── llm/                    # Runtime wrapper for sandboxes
└── docs/                   # SDK documentation for prompts

types/
└── database.ts             # Supabase-generated types
```

## Database Schema

4 tables in Supabase:
- **projects** - Voice agent projects (name, code, sandbox_id, webhook_url)
- **chat_messages** - Conversation history per project
- **webhook_events** - Incoming sipgate events
- **phone_numbers** - Assigned phone numbers pool (02041-34873-10 through 99)

## Key Patterns

### Authentication
- Supabase SSR with middleware protection
- Protected routes: `/builder/*`, `/projects/*`
- sipgate OAuth stores access tokens in user_metadata for SIP credentials

### Code Generation
- Claude Sonnet 4 with streaming responses
- User writes AiFlowAssistant.create({...}) config only
- Runtime wraps with imports, Express server, and callLLM() helper

### Sandbox Management
- E2B sandboxes with custom Node.js template
- Deploy kills existing processes before starting new
- Port 3000 health check polling (max 15s)
- In-memory log storage (200 line limit)

### API Patterns
- Streaming: Use ReadableStream for chat/generate
- Service role client for webhooks (bypasses RLS)
- Error handling with console logging

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
ANTHROPIC_API_KEY
E2B_API_KEY
NEXT_PUBLIC_APP_URL
SIPGATE_CLIENT_ID
SIPGATE_CLIENT_SECRET
```

## Important Conventions

1. **Client components:** Mark with "use client" directive
2. **Path aliases:** Use `@/` for imports from project root
3. **Types:** Full TypeScript strict mode, types in `types/`
4. **Styling:** Use DaisyUI component classes (btn, card, etc.)
5. **API routes:** Located in `app/api/`, use route.ts files

## Gotchas

- **Sandbox costs:** Each sandbox stays alive ~1 hour
- **Process cleanup:** Must `pkill -f node` before deploying new code
- **sipgate SDK:** Requires TTS config with language, voice, session_id
- **Session ID:** Must pass in all speak() actions
- **Call termination:** Use onAssistantSpeechEnded for hangup
- **Theme hydration:** ThemeProvider returns null on server

## Working with Voice Agents

The generated code uses `@sipgate/ai-flow-sdk`. Key patterns:
- Event handlers: onSessionStart, onUserSpeak, onAssistantSpeechEnded, onSessionEnd
- Actions: speak, transfer, hangup
- LLM calls: Use injected `callLLM()` helper (proxied through /api/llm/[projectId])
- State: Session state managed via Map<sessionId, state>
