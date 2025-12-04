# sipgate AI Flow SDK Documentation

## Overview

The sipgate AI Flow SDK (`@sipgate/ai-flow-sdk`) is a TypeScript SDK for building AI-powered voice assistants with real-time speech processing capabilities. It uses an event-driven model to respond to call events.

## Installation

```bash
npm install @sipgate/ai-flow-sdk
# Requires Node.js >= 22.0.0 and TypeScript 5.x
```

## Basic Setup

```typescript
import { AiFlowAssistant } from "@sipgate/ai-flow-sdk";

const assistant = AiFlowAssistant.create({
  debug: true,

  onSessionStart: async (event) => {
    console.log(`Session started for ${event.session.phone_number}`);
    return "Hello! How can I help you today?";
  },

  onUserSpeak: async (event) => {
    const userText = event.text;
    console.log(`User said: ${userText}`);
    return `You said: ${userText}`;
  },

  onSessionEnd: async (event) => {
    console.log(`Session ${event.session.id} ended`);
  },

  onUserBargeIn: async (event) => {
    console.log(`User interrupted with: ${event.text}`);
    return "I'm listening, please continue.";
  },
});
```

## Express.js Integration

```typescript
import express from "express";
import { AiFlowAssistant } from "@sipgate/ai-flow-sdk";

const app = express();
app.use(express.json());

const assistant = AiFlowAssistant.create({
  debug: process.env.NODE_ENV !== "production",

  onSessionStart: async (event) => {
    return "Welcome! How can I help you today?";
  },

  onUserSpeak: async (event) => {
    return processUserInput(event.text);
  },

  onSessionEnd: async (event) => {
    await cleanupSession(event.session.id);
  },
});

app.post("/webhook", assistant.express());
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(3000, () => {
  console.log("AI Flow assistant running on port 3000");
});
```

## Event Types

### SessionStart Event

Triggered when a new call session begins.

```typescript
interface AiFlowApiEventSessionStart {
  type: "session_start";
  session: {
    id: string;              // UUID of the session
    account_id: string;       // Account identifier
    phone_number: string;     // Phone number for this flow session
    direction?: "inbound" | "outbound";
    from_phone_number: string;
    to_phone_number: string;
  };
}
```

### UserSpeak Event

Triggered when the user finishes speaking.

```typescript
interface AiFlowApiEventUserSpeak {
  type: "user_speak";
  text: string;              // Transcribed text from user
  session: SessionInfo;
}
```

### UserBargeIn Event

Triggered when the user interrupts the assistant.

```typescript
interface AiFlowApiEventUserBargeIn {
  type: "user_barge_in";
  text: string;
  session: SessionInfo;
}
```

### AssistantSpeak Event

Triggered after the assistant speaks.

```typescript
interface AiFlowApiEventAssistantSpeak {
  type: "assistant_speak";
  text?: string;
  ssml?: string;
  duration_ms: number;
  speech_started_at: number;
  session: SessionInfo;
}
```

### AssistantSpeechEnded Event

Triggered when the assistant finishes speaking.

```typescript
interface AiFlowApiEventAssistantSpeechEnded {
  type: "assistant_speech_ended";
  session: SessionInfo;
}
```

### SessionEnd Event

Triggered when the call ends.

```typescript
interface AiFlowApiEventSessionEnd {
  type: "session_end";
  session: SessionInfo;
}
```

## Actions

### Speak Action

Make the assistant speak to the user.

```typescript
import { AiFlowActionType, TtsProvider } from "@sipgate/ai-flow-sdk";

// Simple text with TTS configuration (RECOMMENDED)
return {
  type: AiFlowActionType.SPEAK,
  session_id: event.session.id,
  text: "Hello, how can I help you?",
  tts: {
    provider: TtsProvider.AZURE,
    language: "de-DE",
    voice: "de-DE-KatjaNeural",
  },
};

// With SSML for advanced speech control
return {
  type: AiFlowActionType.SPEAK,
  session_id: event.session.id,
  ssml: `
    <speak>
      <prosody rate="slow">Please listen carefully.</prosody>
      <break time="500ms"/>
      Your balance is <say-as interpret-as="currency">$42.50</say-as>
    </speak>
  `,
  tts: {
    provider: TtsProvider.AZURE,
    language: "en-US",
    voice: "en-US-JennyNeural",
  },
};
```

## TTS Provider Configuration

**IMPORTANT:** Always configure TTS with language and voice for the best user experience.

### Azure Cognitive Services (Recommended)

```typescript
interface TtsProviderConfigAzure {
  provider: TtsProvider.AZURE;
  language: string; // BCP-47 format (e.g., "en-US", "de-DE")
  voice: string;    // Voice name (e.g., "en-US-JennyNeural")
}
```

### Popular Azure Voices

| Language | Voice Name           | Gender | Description              |
|----------|----------------------|--------|--------------------------|
| de-DE    | de-DE-KatjaNeural    | Female | Professional, clear      |
| de-DE    | de-DE-ConradNeural   | Male   | Deep, authoritative      |
| de-DE    | de-DE-AmalaNeural    | Female | Warm, friendly           |
| de-DE    | de-DE-FlorianMultilingualNeural | Male | Multilingual, natural |
| en-US    | en-US-JennyNeural    | Female | Friendly, professional   |
| en-US    | en-US-GuyNeural      | Male   | Clear, neutral           |
| en-US    | en-US-AriaNeural     | Female | Expressive, versatile    |
| en-GB    | en-GB-SoniaNeural    | Female | British, professional    |
| en-GB    | en-GB-RyanNeural     | Male   | British, friendly        |
| es-ES    | es-ES-ElviraNeural   | Female | Professional, clear      |
| es-ES    | es-ES-AlvaroNeural   | Male   | Warm, natural            |
| fr-FR    | fr-FR-DeniseNeural   | Female | Professional, elegant    |
| fr-FR    | fr-FR-HenriNeural    | Male   | Clear, authoritative     |

### ElevenLabs (Alternative)

```typescript
interface TtsProviderConfigElevenLabs {
  provider: TtsProvider.ELEVEN_LABS;
  language?: string;
  voice?: string; // ElevenLabs voice ID
}

// Example
tts: {
  provider: TtsProvider.ELEVEN_LABS,
  voice: "21m00Tcm4TlvDq8ikWAM"  // 'Rachel' voice ID
}
```

### Transfer Action

Transfer the call to another number.

```typescript
return {
  type: "transfer",
  session_id: event.session.id,
  target_phone_number: "+1234567890",
  caller_id_name: "Support",
  caller_id_number: "+1234567890",
};
```

### Hangup Action

End the call.

```typescript
return {
  type: "hangup",
  session_id: event.session.id,
};
```

## Barge-In Configuration

Control when users can interrupt the assistant.

```typescript
import { BargeInStrategy } from "@sipgate/ai-flow-sdk";

return {
  type: "speak",
  session_id: event.session.id,
  text: "Welcome to customer support...",
  barge_in: {
    strategy: BargeInStrategy.MINIMUM_CHARACTERS,
    minimum_characters: 3,
  },
};

// Disable barge-in for important messages
return {
  type: "speak",
  session_id: event.session.id,
  text: "Thank you for calling. Have a great day!",
  barge_in: { strategy: BargeInStrategy.NONE },
};
```

## Complete Example: Customer Service Bot

```typescript
import { AiFlowAssistant, BargeInStrategy } from "@sipgate/ai-flow-sdk";
import express from "express";

const sessions = new Map<string, { state: string; data: any }>();

const assistant = AiFlowAssistant.create({
  debug: true,

  onSessionStart: async (event) => {
    sessions.set(event.session.id, {
      state: "greeting",
      data: { attempts: 0 },
    });

    return {
      type: "speak",
      session_id: event.session.id,
      text: "Welcome to customer support. How can I help you today?",
      barge_in: {
        strategy: BargeInStrategy.MINIMUM_CHARACTERS,
        minimum_characters: 3,
      },
    };
  },

  onUserSpeak: async (event) => {
    const session = sessions.get(event.session.id);
    if (!session) return null;

    const text = event.text.toLowerCase();

    // Intent routing
    if (text.includes("billing") || text.includes("invoice")) {
      return {
        type: "transfer",
        session_id: event.session.id,
        target_phone_number: "+1234567890",
        caller_id_name: "Billing Department",
      };
    }

    if (text.includes("goodbye") || text.includes("bye")) {
      return {
        type: "speak",
        session_id: event.session.id,
        text: "Thank you for calling. Have a great day!",
        barge_in: { strategy: BargeInStrategy.NONE },
      };
    }

    if (text.includes("technical") || text.includes("support")) {
      session.state = "technical_support";
      return "I'll help with technical support. Please describe your issue.";
    }

    session.data.attempts++;
    if (session.data.attempts > 2) {
      return "Let me transfer you to a representative.";
    }

    return "I can help with billing, technical support, or sales.";
  },

  onUserBargeIn: async (event) => {
    console.log(`User interrupted: ${event.text}`);
    return "Yes, I'm listening.";
  },

  onSessionEnd: async (event) => {
    sessions.delete(event.session.id);
    console.log(`Session ${event.session.id} ended`);
  },
});

const app = express();
app.use(express.json());
app.post("/webhook", assistant.express());
app.listen(3000, () => console.log("Bot running on port 3000"));
```

## Best Practices

1. **Always handle all events** - Even if you don't need to respond, log the events.
2. **Use state management** - Track conversation state for multi-turn dialogs.
3. **Implement graceful handoff** - Transfer to humans when the bot can't help.
4. **Use SSML for natural speech** - Control pacing, emphasis, and pronunciation.
5. **Configure barge-in appropriately** - Allow interruption for long messages.
6. **Clean up on session end** - Free resources when calls end.
7. **Add health checks** - Include a `/health` endpoint for monitoring.
