import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from "@/lib/anthropic/prompts";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, projectId, currentCode } = await request.json();

    if (!message || !projectId || !currentCode) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Save user message to database
    await supabase.from("chat_messages").insert({
      project_id: projectId,
      role: "user",
      content: message,
    });

    const client = getAnthropicClient();

    // Fetch previous messages for context
    const { data: previousMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(10);

    // Build messages array with history
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (previousMessages) {
      for (const msg of previousMessages.slice(0, -1)) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Add current message with context
    messages.push({
      role: "user",
      content: buildChatPrompt(currentCode, message),
    });

    // Create streaming response
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: CHAT_SYSTEM_PROMPT,
      messages,
    });

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // If response contains code, extract summary and update the project
        let messageToSave = fullResponse;
        if (fullResponse.includes("```typescript")) {
          const codeMatch = fullResponse.match(
            /```typescript\n([\s\S]*?)\n```/
          );
          if (codeMatch) {
            const newCode = codeMatch[1].trim();
            await supabase
              .from("projects")
              .update({
                current_code: newCode,
                updated_at: new Date().toISOString(),
              })
              .eq("id", projectId);

            // Extract summary (text before code block) for chat display
            const summaryMatch = fullResponse.match(/^([\s\S]*?)```typescript/);
            const summary = summaryMatch
              ? summaryMatch[1].trim()
              : "Code updated.";
            messageToSave = summary || "Code updated.";
          }
        }

        // Save assistant message to database (summary only, not full code)
        await supabase.from("chat_messages").insert({
          project_id: projectId,
          role: "assistant",
          content: messageToSave,
        });

        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
