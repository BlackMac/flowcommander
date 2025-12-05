import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/admin/cleanup-phone-numbers - Release phone numbers assigned to deleted projects
export async function POST() {
  const serviceClient = createServiceClient();

  try {
    // Find all phone numbers that have a project_id
    const { data: assignedNumbers, error: fetchError } = await serviceClient
      .from("phone_numbers")
      .select("id, phone_number, display_number, project_id")
      .not("project_id", "is", null);

    if (fetchError) {
      console.error("Failed to fetch assigned numbers:", fetchError);
      return NextResponse.json(
        {
          error: "Failed to fetch phone numbers",
          details: fetchError.message,
          code: fetchError.code,
        },
        { status: 500 }
      );
    }

    if (!assignedNumbers || assignedNumbers.length === 0) {
      return NextResponse.json({
        message: "No assigned phone numbers found",
        released: 0,
      });
    }

    // Check which projects actually exist
    const projectIds = assignedNumbers.map((n) => n.project_id).filter(Boolean);
    const { data: existingProjects, error: projectError } = await serviceClient
      .from("projects")
      .select("id")
      .in("id", projectIds);

    if (projectError) {
      console.error("Failed to fetch projects:", projectError);
      return NextResponse.json(
        { error: "Failed to verify projects" },
        { status: 500 }
      );
    }

    // Find orphaned numbers (assigned to non-existent projects)
    const existingProjectIds = new Set(existingProjects?.map((p) => p.id) || []);
    const orphanedNumbers = assignedNumbers.filter(
      (n) => n.project_id && !existingProjectIds.has(n.project_id)
    );

    if (orphanedNumbers.length === 0) {
      return NextResponse.json({
        message: "No orphaned phone numbers found",
        released: 0,
        totalChecked: assignedNumbers.length,
      });
    }

    // Release the orphaned numbers
    const orphanedIds = orphanedNumbers.map((n) => n.id);
    const { error: releaseError } = await serviceClient
      .from("phone_numbers")
      .update({
        project_id: null,
        assigned_at: null,
      })
      .in("id", orphanedIds);

    if (releaseError) {
      console.error("Failed to release orphaned numbers:", releaseError);
      return NextResponse.json(
        { error: "Failed to release phone numbers" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Successfully released orphaned phone numbers",
      released: orphanedNumbers.length,
      totalChecked: assignedNumbers.length,
      orphanedNumbers: orphanedNumbers.map((n) => ({
        number: n.display_number,
        phoneNumber: n.phone_number,
        projectId: n.project_id,
      })),
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Failed to cleanup phone numbers" },
      { status: 500 }
    );
  }
}
