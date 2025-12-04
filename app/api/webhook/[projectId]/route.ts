import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// This webhook proxy receives events from sipgate, logs them, and forwards to the sandbox

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();

    // Use service role client to bypass RLS since webhook calls are unauthenticated
    const supabase = createServiceClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("webhook_url, sandbox_id")
      .eq("id", projectId)
      .single();

    console.log(`[Webhook] Project lookup for ${projectId}:`, {
      found: !!project,
      webhook_url: project?.webhook_url,
      sandbox_id: project?.sandbox_id,
      error: projectError?.message
    });

    // Log the event to database for real-time display
    const { data: insertedEvent, error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        project_id: projectId,
        event_type: body.type || "unknown",
        event_data: body,
      })
      .select()
      .single();

    console.log(`[Webhook] Event insert result:`, {
      success: !insertError,
      insertedEvent,
      error: insertError?.message,
      code: insertError?.code,
      details: insertError?.details,
    });

    // If sandbox is running, forward the request
    if (project?.webhook_url) {
      try {
        const response = await fetch(project.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        // Return the sandbox response
        const responseBody = await response.text();

        // If sandbox returned an error, return a user-friendly voice response
        if (!response.ok) {
          console.error(`[Webhook] Sandbox returned ${response.status}:`, responseBody);

          // Return a sipgate AI Flow compatible error response
          return NextResponse.json({
            type: "speak",
            text: "Es tut mir leid, aber es ist ein technisches Problem aufgetreten. Bitte versuchen Sie es später erneut.",
            barge_in: { strategy: "none" },
            end_of_conversation: true,
          });
        }

        return new Response(responseBody, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (forwardError) {
        console.error("Failed to forward to sandbox:", forwardError);
        // Return a user-friendly voice response for connection errors
        return NextResponse.json({
          type: "speak",
          text: "Es tut mir leid, aber der Dienst ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.",
          barge_in: { strategy: "none" },
          end_of_conversation: true,
        });
      }
    }

    // No sandbox running - return a voice response
    return NextResponse.json({
      type: "speak",
      text: "Dieser Dienst ist momentan nicht aktiv. Bitte versuchen Sie es später erneut.",
      barge_in: { strategy: "none" },
      end_of_conversation: true,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    // Return a voice response for any unhandled errors
    return NextResponse.json({
      type: "speak",
      text: "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es später erneut.",
      barge_in: { strategy: "none" },
      end_of_conversation: true,
    });
  }
}

// Health check for the webhook endpoint
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  return NextResponse.json({
    status: "ok",
    projectId,
    message: "Webhook endpoint is ready",
  });
}
