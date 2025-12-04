import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface SipCredentials {
  username: string;
  password: string;
  sipServer: string;
  websocketUrl: string;
  deviceId: string;
  deviceAlias: string;
}

/**
 * GET /api/sip/credentials
 *
 * Returns SIP credentials for the authenticated sipgate user.
 * Credentials are fetched once at login and stored in user_metadata.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user logged in via sipgate
    const provider = user.user_metadata?.provider;
    if (provider !== "sipgate") {
      return NextResponse.json(
        { error: "SIP calling requires sipgate login", provider },
        { status: 403 }
      );
    }

    // Get SIP credentials from user metadata (stored at login time)
    const sipCredentials = user.user_metadata?.sip_credentials as SipCredentials | undefined;

    if (!sipCredentials) {
      return NextResponse.json(
        { error: "No SIP credentials found. Please re-login with sipgate." },
        { status: 404 }
      );
    }

    return NextResponse.json(sipCredentials);
  } catch (error) {
    console.error("[SIP] Error getting credentials:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
