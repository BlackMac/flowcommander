import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { NextResponse } from "next/server";

const FLOW_DIAGRAM_PROMPT = `Analyze this sipgate AI Flow voice agent code and generate a Mermaid flowchart diagram.

Rules:
1. Use flowchart TD (top-down) orientation
2. Show event handlers as rounded rectangles: A([onSessionStart])
3. Show speak actions as parallelograms: B[/"Hello!"/]
4. Show decisions as diamonds: C{User Intent}
5. Show hangup as: X[Hangup]
6. Show callLLM as subroutine: L[[callLLM]]
7. Use arrows with labels for conditions: -->|"goodbye"|
8. Keep text concise (max 25 chars per node)
9. Use simple node IDs (A, B, C, etc.)
10. Output ONLY the Mermaid code, no markdown fences, no explanation

Example output format:
flowchart TD
    A([onSessionStart]) --> B[/"Greeting"/]
    B --> C{User Speaks}
    C --> D([onUserSpeak])
    D --> E[[callLLM]]
    E --> F[/"Response"/]
    F --> C

Code to analyze:`;

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid code" },
        { status: 400 }
      );
    }

    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${FLOW_DIAGRAM_PROMPT}\n\n\`\`\`typescript\n${code}\n\`\`\``,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "Failed to generate diagram" },
        { status: 500 }
      );
    }

    // Clean up the mermaid code (remove any accidental markdown fences)
    let mermaidCode = textContent.text.trim();
    mermaidCode = mermaidCode
      .replace(/^```(?:mermaid)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    return NextResponse.json({ mermaid: mermaidCode });
  } catch (error) {
    console.error("Flow diagram generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate flow diagram" },
      { status: 500 }
    );
  }
}
