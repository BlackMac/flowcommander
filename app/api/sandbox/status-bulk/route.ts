import { createClient } from "@/lib/supabase/server";
import { getSandboxStatus } from "@/lib/sandbox/e2b";
import { NextResponse } from "next/server";

export interface BulkSandboxStatus {
  [projectId: string]: {
    status: "running" | "stopped" | "error" | "port_down";
    url?: string;
  };
}

// POST /api/sandbox/status-bulk
// Check sandbox status for multiple projects at once
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const projectIds: string[] = body.projectIds;

  if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
    return NextResponse.json({ error: "Missing projectIds array" }, { status: 400 });
  }

  // Get all projects with sandbox_ids that belong to this user
  const { data: projects } = await supabase
    .from("projects")
    .select("id, sandbox_id")
    .eq("user_id", user.id)
    .in("id", projectIds);

  if (!projects) {
    return NextResponse.json({ statuses: {} });
  }

  // Check status for each project with a sandbox_id
  const statuses: BulkSandboxStatus = {};

  // Check all sandboxes in parallel
  await Promise.all(
    projects.map(async (project) => {
      if (project.sandbox_id) {
        try {
          const status = await getSandboxStatus(project.id, project.sandbox_id);
          statuses[project.id] = status;

          // If sandbox is stopped but we have sandbox_id in DB, clear it
          if (status.status === "stopped") {
            await supabase
              .from("projects")
              .update({ sandbox_id: null, webhook_url: null })
              .eq("id", project.id);
          }
        } catch {
          statuses[project.id] = { status: "stopped" };
        }
      } else {
        statuses[project.id] = { status: "stopped" };
      }
    })
  );

  return NextResponse.json({ statuses });
}
