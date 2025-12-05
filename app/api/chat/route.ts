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

    // Define Context7 tools for fetching documentation
    const tools = [
      {
        name: "resolve_library_id",
        description: "Search for a library's Context7-compatible ID by name. Use this when you need to look up documentation for an npm package or library.",
        input_schema: {
          type: "object" as const,
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
          type: "object" as const,
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
    ] as const;

    // Create a readable stream for real-time status updates
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Create streaming response with tool support
          const stream = await client.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: CHAT_SYSTEM_PROMPT,
            messages,
            tools,
          });

          // Handle tool use and generate final response
          let finalMessage = await stream.finalMessage();

          // Handle tool calls in a loop (Claude may need multiple rounds)
          let maxToolRounds = 5; // Prevent infinite loops

          while (maxToolRounds > 0 && finalMessage.stop_reason === "tool_use") {
            maxToolRounds--;
            console.log("[Chat] Claude is requesting tool use");

            // Extract tool calls
            const toolUseBlocks = finalMessage.content.filter(
              (block: any) => block.type === "tool_use"
            );

            // Execute each tool call
            const toolResults = await Promise.all(
              toolUseBlocks.map(async (toolUse: any) => {
                console.log(`[Chat] Calling tool: ${toolUse.name}`, toolUse.input);

                // Generate and immediately stream status message
                let statusMessage = "";
                if (toolUse.name === "resolve_library_id") {
                  statusMessage = `🔍 Looking up ${toolUse.input.library_name} documentation...`;
                } else if (toolUse.name === "get_library_docs") {
                  const topic = toolUse.input.topic ? ` (${toolUse.input.topic})` : "";
                  statusMessage = `📚 Fetching ${toolUse.input.library_id}${topic} documentation...`;
                }

                // Stream status immediately
                if (statusMessage) {
                  controller.enqueue(encoder.encode(`[STATUS]${statusMessage}\n`));
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
                  console.log(`[Chat] Tool result:`, result);

                  return {
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  };
                } catch (error) {
                  console.error(`[Chat] Tool error:`, error);
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
              system: CHAT_SYSTEM_PROMPT,
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

          // Stream the full response
          controller.enqueue(encoder.encode(fullResponse));

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
        } catch (error) {
          console.error("[Chat] Stream error:", error);
          controller.error(error);
        }
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
