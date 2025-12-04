import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  initial_prompt: z.string().min(1).max(10000),
});

// GET /api/projects - List all projects for the user
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch phone numbers for all projects
  if (projects && projects.length > 0) {
    const projectIds = projects.map(p => p.id);
    const { data: phoneNumbers } = await supabase
      .from("phone_numbers")
      .select("*")
      .in("project_id", projectIds);

    // Map phone numbers to projects
    const phoneMap = new Map(phoneNumbers?.map(pn => [pn.project_id, pn]) || []);
    const projectsWithPhones = projects.map(project => ({
      ...project,
      phone_number: phoneMap.get(project.id) || null,
    }));

    return NextResponse.json({ projects: projectsWithPhones });
  }

  return NextResponse.json({ projects });
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createProjectSchema.parse(body);

    // Find an available phone number (using service client to bypass RLS)
    const { data: availableNumber, error: numberError } = await serviceClient
      .from("phone_numbers")
      .select("*")
      .is("project_id", null)
      .limit(1)
      .single();

    if (numberError || !availableNumber) {
      console.error("No available phone numbers:", numberError);
      return NextResponse.json(
        { error: "No phone numbers available. Please try again later or contact support." },
        { status: 503 }
      );
    }

    // Create the project
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: validated.name,
        initial_prompt: validated.initial_prompt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Assign the phone number to the project (using service client)
    const { error: assignError } = await serviceClient
      .from("phone_numbers")
      .update({
        project_id: project.id,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", availableNumber.id);

    if (assignError) {
      console.error("Failed to assign phone number:", assignError);
      // Project was created but phone assignment failed - we'll continue anyway
      // The project can still work via the legacy [projectId] webhook route
    }

    // Return project with assigned phone number
    return NextResponse.json({
      project: {
        ...project,
        phone_number: availableNumber,
      },
    }, { status: 201 });
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
