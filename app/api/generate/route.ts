import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { SYSTEM_PROMPT, buildGenerationPrompt } from "@/lib/anthropic/prompts";
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
    const { prompt, projectId } = await request.json();

    if (!prompt || !projectId) {
      return NextResponse.json(
        { error: "Missing prompt or projectId" },
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

    const client = getAnthropicClient();

    // Create streaming response
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildGenerationPrompt(prompt),
        },
      ],
    });

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        let streamingStarted = false;

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;

            if (!streamingStarted) {
              // Buffer until we see the first newline (end of fence line)
              const firstNewline = fullResponse.indexOf("\n");
              if (firstNewline !== -1) {
                streamingStarted = true;
                // Check if it starts with a fence
                const firstLine = fullResponse.substring(0, firstNewline);
                if (firstLine.match(/^```(?:typescript|ts|javascript|js)?$/)) {
                  // Skip the fence line, stream everything after
                  const afterFence = fullResponse.substring(firstNewline + 1);
                  if (afterFence) {
                    controller.enqueue(encoder.encode(afterFence));
                  }
                } else {
                  // No fence, stream everything
                  controller.enqueue(encoder.encode(fullResponse));
                }
              }
            } else {
              // Already streaming, just send the new text
              controller.enqueue(encoder.encode(text));
            }
          }
        }

        // Clean up the code (remove markdown code blocks)
        const cleanCode = fullResponse
          .replace(/^```(?:typescript|ts|javascript|js)?\n/, "")
          .replace(/\n```\s*$/, "")
          .trim();

        // Extract project name from the code comment (// Project: <name>)
        const projectNameMatch = cleanCode.match(/^\/\/\s*Project:\s*(.+)$/m);
        const projectName = projectNameMatch
          ? projectNameMatch[1].trim()
          : null;

        // Save the final code and optionally update the project name
        const updateData: { current_code: string; updated_at: string; name?: string } = {
          current_code: cleanCode,
          updated_at: new Date().toISOString(),
        };

        if (projectName) {
          updateData.name = projectName;
        }

        await supabase
          .from("projects")
          .update(updateData)
          .eq("id", projectId);

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
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate code" },
      { status: 500 }
    );
  }
}
