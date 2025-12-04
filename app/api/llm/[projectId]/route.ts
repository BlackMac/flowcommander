import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "@/lib/supabase/server";

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMRequestBody {
  messages: LLMMessage[];
  maxTokens?: number;
}

// Initialize Google GenAI client
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
}

// POST /api/llm/[projectId]
// Called by sandbox code to make LLM requests without exposing API key
// Uses Gemini 2.5 Flash for fast, cost-effective responses
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Validate request body
    const body: LLMRequestBody = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    // Validate project exists (authorization check)
    const supabase = createServiceClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Extract system message and user/assistant messages
    const systemMessages = body.messages.filter((m) => m.role === "system");
    const conversationMessages = body.messages.filter((m) => m.role !== "system");

    const systemInstruction = systemMessages.map((m) => m.content).join("\n\n") || undefined;

    // Convert messages to Gemini format
    const geminiContents = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Call Gemini 2.5 Flash
    const client = getGeminiClient();
    const model = "gemini-flash-latest";

    console.log(`[LLM] Calling Gemini for project ${projectId}`, {
      model,
      systemInstruction: systemInstruction?.substring(0, 100),
      messagesCount: geminiContents.length,
    });

    const response = await client.models.generateContent({
      model,
      contents: geminiContents,
      config: {
        systemInstruction,
        maxOutputTokens: Math.min(body.maxTokens || 1024, 4096),
      },
    });

    // Extract response text
    const responseText = response.text || "";
    console.log(`[LLM] Gemini response (${responseText.length} chars):`, responseText.substring(0, 100));

    // Log usage to database (fire and forget)
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    // Fire and forget - don't await
    void supabase
      .from("llm_calls")
      .insert({
        project_id: projectId,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      })
      .then(({ error }) => {
        if (error) console.error("Failed to log LLM call:", error);
      });

    return NextResponse.json({
      response: responseText,
      usage: {
        inputTokens,
        outputTokens,
      },
    });
  } catch (error) {
    console.error("LLM proxy error:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
