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

    // Define Context7 tools for fetching documentation
    const tools = [
      {
        name: "resolve_library_id",
        description: "Search for a library's Context7-compatible ID by name. Use this when you need to look up documentation for an npm package or library.",
        input_schema: {
          type: "object",
          properties: {
            library_name: {
              type: "string",
              description: "The name of the library to search for (e.g., 'react', '@sipgate/ai-flow-sdk', 'express')",
            },
          },
          required: ["library_name"],
        },
      },
      {
        name: "get_library_docs",
        description: "Fetch up-to-date documentation and code examples for a specific library. Use this to get current API references, usage patterns, and examples.",
        input_schema: {
          type: "object",
          properties: {
            library_id: {
              type: "string",
              description: "The Context7-compatible library ID (format: /org/project)",
            },
            topic: {
              type: "string",
              description: "Optional topic to focus the documentation on (e.g., 'routing', 'authentication', 'hooks')",
            },
            mode: {
              type: "string",
              enum: ["code", "info"],
              description: "Mode: 'code' for API references and examples (default), 'info' for conceptual guides",
            },
          },
          required: ["library_id"],
        },
      },
    ];

    // Create streaming response with tool support
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
      tools,
    });

    // Handle tool use and generate final response
    let finalMessage = await stream.finalMessage();

    // Handle tool calls in a loop (Claude may need multiple rounds)
    const messages: any[] = [
      {
        role: "user",
        content: buildGenerationPrompt(prompt),
      },
    ];

    let maxToolRounds = 5; // Prevent infinite loops

    // Store status messages to send to the frontend
    const statusMessages: string[] = [];

    while (maxToolRounds > 0 && finalMessage.stop_reason === "tool_use") {
      maxToolRounds--;
      console.log("[Generate] Claude is requesting tool use");

      // Extract tool calls
      const toolUseBlocks = finalMessage.content.filter(
        (block: any) => block.type === "tool_use"
      );

      // Execute each tool call
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse: any) => {
          console.log(`[Generate] Calling tool: ${toolUse.name}`, toolUse.input);

          // Generate user-friendly status message
          let statusMessage = "";
          if (toolUse.name === "resolve_library_id") {
            statusMessage = `🔍 Looking up ${toolUse.input.library_name} documentation...`;
            statusMessages.push(statusMessage);
          } else if (toolUse.name === "get_library_docs") {
            const topic = toolUse.input.topic ? ` (${toolUse.input.topic})` : "";
            statusMessage = `📚 Fetching ${toolUse.input.library_id}${topic} documentation...`;
            statusMessages.push(statusMessage);
          }

          try {
            const toolResponse = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL}/api/tools/context7`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tool: toolUse.name === "resolve_library_id"
                    ? "resolve-library-id"
                    : "get-library-docs",
                  ...(toolUse.name === "resolve_library_id"
                    ? { libraryName: toolUse.input.library_name }
                    : {
                        context7CompatibleLibraryID: toolUse.input.library_id,
                        topic: toolUse.input.topic,
                        mode: toolUse.input.mode || "code",
                      }),
                }),
              }
            );

            const result = await toolResponse.json();
            console.log(`[Generate] Tool result:`, result);

            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          } catch (error) {
            console.error(`[Generate] Tool error:`, error);
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
              is_error: true,
            };
          }
        })
      );

      // Add assistant message and tool results to conversation
      messages.push({
        role: "assistant",
        content: finalMessage.content,
      });

      messages.push({
        role: "user",
        content: toolResults,
      });

      // Continue the conversation with tool results
      const continueStream = await client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools,
      });

      finalMessage = await continueStream.finalMessage();
    }

    // Extract the final text response
    const textBlocks = finalMessage.content.filter(
      (block: any) => block.type === "text"
    );
    const fullResponse = textBlocks.map((block: any) => block.text).join("\n");

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        // Send status messages first
        if (statusMessages.length > 0) {
          for (const status of statusMessages) {
            controller.enqueue(encoder.encode(`[STATUS]${status}\n`));
          }
        }

        // Clean up the code (remove markdown code blocks)
        const cleanCode = fullResponse
          .replace(/^```(?:typescript|ts|javascript|js)?\n/, "")
          .replace(/\n```\s*$/, "")
          .trim();

        // Stream the cleaned code
        controller.enqueue(encoder.encode(cleanCode));

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
