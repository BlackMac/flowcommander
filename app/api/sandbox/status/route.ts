import { createClient } from "@/lib/supabase/server";
import { getSandboxStatus } from "@/lib/sandbox/e2b";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
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

  const status = await getSandboxStatus(projectId, project.sandbox_id);
  return NextResponse.json(status);
}
