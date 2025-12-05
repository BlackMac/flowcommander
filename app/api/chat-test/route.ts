import { NextResponse } from "next/server";

/**
 * API endpoint to test voice agents via text chat
 * This proxies requests to the agent's webhook and formats them as sipgate AI Flow events
 */
export async function POST(request: Request) {
  try {
    const { webhookUrl, event, session, text } = await request.json();

    console.log(`[Chat Test] Received request: event=${event}, webhookUrl=${webhookUrl}`);

    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL required" }, { status: 400 });
    }

    // Transform to sipgate AI Flow event format
    // Based on @sipgate/ai-flow-sdk documentation
    const sessionInfo = {
      id: session.id,
      account_id: "text-chat-account",
      phone_number: "+00000000000",
      direction: "inbound" as const,
      from_phone_number: "+00000000000",
      to_phone_number: "+11111111111",
    };

    let sipgateEvent: any;

    if (event === "session_start") {
      sipgateEvent = {
        type: "session_start",
        session: sessionInfo,
      };
    } else if (event === "user_speak") {
      sipgateEvent = {
        type: "user_speak",
        text: text,
        session: sessionInfo,
      };
    } else if (event === "session_end") {
      sipgateEvent = {
        type: "session_end",
        session: sessionInfo,
      };
    }

    console.log(`[Chat Test] Forwarding sipgate-formatted event:`, JSON.stringify(sipgateEvent));

    // Forward event to agent's webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sipgateEvent),
    });

    console.log(`[Chat Test] Webhook response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Chat Test] Webhook error: ${errorText}`);
      return NextResponse.json(
        { error: `Agent webhook returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    // Parse response - could be JSON (speak action) or plain text ("OK")
    const contentType = response.headers.get("content-type");
    console.log(`[Chat Test] Response content-type: ${contentType}`);

    // Read response as text first (can only read once)
    const responseText = await response.text();
    console.log(`[Chat Test] Raw response: ${responseText}`);

    // Try to parse as JSON, regardless of content-type header
    // (agent might set wrong content-type)
    try {
      const data = JSON.parse(responseText);
      console.log(`[Chat Test] Parsed as JSON:`, data);

      // Extract text from speak action
      if (data.type === "speak" && data.text) {
        console.log(`[Chat Test] Returning speak action text: ${data.text}`);
        return NextResponse.json({
          text: data.text,
          type: data.type,
        });
      }

      // Handle hangup
      if (data.type === "hangup") {
        console.log(`[Chat Test] Returning hangup`);
        return NextResponse.json({
          type: "hangup",
          text: "Call ended",
        });
      }

      // Other actions
      console.log(`[Chat Test] Returning raw data`);
      return NextResponse.json(data);
    } catch (parseError) {
      // Plain text response (like "OK")
      console.log(`[Chat Test] Plain text response (not JSON): ${responseText}`);
      return NextResponse.json({ text: responseText === "OK" ? null : responseText });
    }
  } catch (error) {
    console.error("[Chat Test] Error:", error);
    return NextResponse.json(
      { error: `Failed to communicate with agent: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
