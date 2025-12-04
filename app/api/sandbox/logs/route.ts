import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSandboxLogs } from "@/lib/sandbox/e2b";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "Project ID required" },
      { status: 400 }
    );
  }

  // Verify user owns this project and get sandbox_id
  const { data: project } = await supabase
    .from("projects")
    .select("id, sandbox_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const { logs, error } = await getSandboxLogs(projectId, project.sandbox_id);

    if (error) {
      return NextResponse.json({ logs: "", error }, { status: 200 });
    }

    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
