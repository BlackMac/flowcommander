import { createClient } from "@/lib/supabase/server";
import { createSandbox } from "@/lib/sandbox/e2b";
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
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, current_code")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Create the sandbox
    const { sandboxId, webhookUrl: sandboxWebhookUrl } = await createSandbox(projectId);

    // The proxy URL is what sipgate should call - it logs events and forwards to sandbox
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const proxyWebhookUrl = `${appUrl}/api/webhook/${projectId}`;

    // Update project with sandbox info
    // webhook_url stores the direct E2B URL for the proxy to forward to
    await supabase
      .from("projects")
      .update({
        sandbox_id: sandboxId,
        webhook_url: sandboxWebhookUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    // Return the proxy URL for the user to give to sipgate
    return NextResponse.json({ sandboxId, webhookUrl: proxyWebhookUrl });
  } catch (error) {
    console.error("Create sandbox error:", error);
    return NextResponse.json(
      { error: "Failed to create sandbox" },
      { status: 500 }
    );
  }
}
