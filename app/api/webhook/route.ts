import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Central webhook that routes all incoming sipgate calls by phone number
// sipgate sends calls to this endpoint, and we look up the project by the called number

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Extract the called number from sipgate payload
    // sipgate AI Flow sends: session.to_phone_number = "+4920413487310"
    const toNumber = body.session?.to_phone_number || body.to_phone_number;

    if (!toNumber) {
      console.error("[Webhook] No to_phone_number in request:", body);
      return NextResponse.json({
        type: "speak",
        text: "Es ist ein Fehler aufgetreten. Die angerufene Nummer konnte nicht ermittelt werden.",
        barge_in: { strategy: "none" },
        end_of_conversation: true,
      });
    }

    // Normalize phone number: remove leading + if present
    const normalizedNumber = toNumber.replace(/^\+/, "");

    console.log(`[Webhook] Incoming call to ${normalizedNumber}`);

    // Use service role client to bypass RLS
    const supabase = createServiceClient();

    // Look up project by phone number
    const { data: phoneNumber, error: phoneError } = await supabase
      .from("phone_numbers")
      .select("project_id")
      .eq("phone_number", normalizedNumber)
      .single();

    if (phoneError || !phoneNumber) {
      console.error(`[Webhook] Phone number not found: ${normalizedNumber}`, phoneError);
      return NextResponse.json({
        type: "speak",
        text: "Diese Nummer ist nicht konfiguriert. Bitte versuchen Sie es mit einer anderen Nummer.",
        barge_in: { strategy: "none" },
        end_of_conversation: true,
      });
    }

    if (!phoneNumber.project_id) {
      console.error(`[Webhook] Phone number ${normalizedNumber} is not assigned to any project`);
      return NextResponse.json({
        type: "speak",
        text: "Diese Nummer ist momentan nicht aktiv. Bitte versuchen Sie es später erneut.",
        barge_in: { strategy: "none" },
        end_of_conversation: true,
      });
    }

    const projectId = phoneNumber.project_id;

    // Get project's sandbox URL
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("webhook_url, sandbox_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error(`[Webhook] Project ${projectId} not found`, projectError);
      return NextResponse.json({
        type: "speak",
        text: "Das Projekt konnte nicht gefunden werden. Bitte versuchen Sie es später erneut.",
        barge_in: { strategy: "none" },
        end_of_conversation: true,
      });
    }

    console.log(`[Webhook] Routing call to project ${projectId}:`, {
      webhook_url: project.webhook_url,
      sandbox_id: project.sandbox_id,
    });

    // Log the event to database for real-time display
    const { error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        project_id: projectId,
        event_type: body.type || "unknown",
        event_data: body,
      });

    if (insertError) {
      console.error(`[Webhook] Failed to log event:`, insertError);
    }

    // If sandbox is running, forward the request
    if (project.webhook_url) {
      try {
        const response = await fetch(project.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const responseBody = await response.text();

        if (!response.ok) {
          console.error(`[Webhook] Sandbox returned ${response.status}:`, responseBody);
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
        console.error("[Webhook] Failed to forward to sandbox:", forwardError);
        return NextResponse.json({
          type: "speak",
          text: "Es tut mir leid, aber der Dienst ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.",
          barge_in: { strategy: "none" },
          end_of_conversation: true,
        });
      }
    }

    // No sandbox running
    return NextResponse.json({
      type: "speak",
      text: "Dieser Dienst ist momentan nicht aktiv. Bitte versuchen Sie es später erneut.",
      barge_in: { strategy: "none" },
      end_of_conversation: true,
    });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json({
      type: "speak",
      text: "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es später erneut.",
      barge_in: { strategy: "none" },
      end_of_conversation: true,
    });
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Central webhook endpoint is ready",
  });
}
