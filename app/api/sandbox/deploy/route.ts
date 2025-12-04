import { createClient } from "@/lib/supabase/server";
import { deploySandbox } from "@/lib/sandbox/e2b";
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
    const { projectId, code } = await request.json();

    if (!projectId || !code) {
      return NextResponse.json(
        { error: "Missing projectId or code" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, sandbox_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.sandbox_id) {
      return NextResponse.json(
        { error: "Sandbox not running" },
        { status: 400 }
      );
    }

    // Deploy the code (pass sandbox_id for reconnection after hot reload)
    const { success, logs } = await deploySandbox(
      projectId,
      code,
      project.sandbox_id
    );

    // Update project with latest code
    await supabase
      .from("projects")
      .update({
        current_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return NextResponse.json({ success, logs });
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json(
      { error: "Failed to deploy code" },
      { status: 500 }
    );
  }
}
