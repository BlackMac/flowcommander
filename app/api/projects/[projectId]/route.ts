import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  current_code: z.string().optional(),
  sandbox_id: z.string().nullable().optional(),
  webhook_url: z.string().nullable().optional(),
});

// GET /api/projects/[projectId] - Get a single project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch phone number for this project
  const { data: phoneNumber } = await supabase
    .from("phone_numbers")
    .select("*")
    .eq("project_id", projectId)
    .single();

  return NextResponse.json({
    project: {
      ...project,
      phone_number: phoneNumber || null,
    },
  });
}

// PATCH /api/projects/[projectId] - Update a project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = updateProjectSchema.parse(body);

    const { data: project, error } = await supabase
      .from("projects")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: err.issues },
        { status: 400 }
      );
    }
    throw err;
  }
}

// DELETE /api/projects/[projectId] - Delete a project
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Release the phone number back to the pool (using service client to bypass RLS)
  const { error: releaseError } = await serviceClient
    .from("phone_numbers")
    .update({
      project_id: null,
      assigned_at: null,
    })
    .eq("project_id", projectId);

  if (releaseError) {
    console.error("Failed to release phone number:", releaseError);
    // Continue with deletion even if phone release fails
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
