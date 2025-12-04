import { createClient } from "@/lib/supabase/server";
import { terminateSandbox } from "@/lib/sandbox/e2b";
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

    // Verify project ownership and get sandbox_id
    const { data: project } = await supabase
      .from("projects")
      .select("id, sandbox_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Terminate the sandbox
    await terminateSandbox(projectId, project.sandbox_id);

    // Update project
    await supabase
      .from("projects")
      .update({
        sandbox_id: null,
        webhook_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Terminate error:", error);
    return NextResponse.json(
      { error: "Failed to terminate sandbox" },
      { status: 500 }
    );
  }
}
