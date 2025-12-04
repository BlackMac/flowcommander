import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SIPGATE_TOKEN_URL =
  "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect/token";
const SIPGATE_USERINFO_URL =
  "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect/userinfo";

interface SipgateUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Use NEXT_PUBLIC_APP_URL for the base URL (important for ngrok/production)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const cookieStore = await cookies();
  const storedState = cookieStore.get("sipgate_oauth_state")?.value;
  const redirectTo = cookieStore.get("sipgate_oauth_redirect")?.value || "/projects";

  // Debug logging for OAuth state
  console.log("[Sipgate OAuth] Callback received:", {
    state,
    storedState,
    hasStoredState: !!storedState,
    allCookies: cookieStore.getAll().map(c => c.name),
  });

  // Clean up cookies
  cookieStore.delete("sipgate_oauth_state");
  cookieStore.delete("sipgate_oauth_redirect");

  // Handle errors from sipgate
  if (error) {
    console.error("Sipgate OAuth error:", error);
    return NextResponse.redirect(`${appUrl}/login?error=sipgate_${error}`);
  }

  // Validate state to prevent CSRF
  if (!state || state !== storedState) {
    console.error("[Sipgate OAuth] State mismatch:", { state, storedState });
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=no_code`);
  }

  const clientId = process.env.SIPGATE_CLIENT_ID;
  const clientSecret = process.env.SIPGATE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${appUrl}/login?error=sipgate_not_configured`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(SIPGATE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/auth/sipgate/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();

    // Get user info from sipgate
    const userInfoResponse = await fetch(SIPGATE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info");
      return NextResponse.redirect(`${appUrl}/login?error=userinfo_failed`);
    }

    const userInfo: SipgateUserInfo = await userInfoResponse.json();

    // Sign in or create user in Supabase using the admin API
    // Since sipgate is not a built-in provider, we use signInWithPassword
    // after creating/verifying the user exists
    const supabase = await createClient();

    // Try to sign in with a magic link style approach -
    // we'll use Supabase's signInWithOtp and auto-confirm via admin
    // Or alternatively, we can use the service role to create a session

    // For simplicity, we'll use a workaround: store sipgate user data
    // and create a session using Supabase's anonymous auth combined with metadata
    // Better approach: Use Supabase's signInAnonymously then link, or use service role

    // Actually, the cleanest approach is to use Supabase Admin API to:
    // 1. Upsert user in auth.users
    // 2. Create a session

    // For now, let's use a simpler approach with custom JWT or
    // leverage Supabase's ability to create users programmatically

    // We'll need the service role key for this
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.redirect(`${appUrl}/login?error=config_error`);
    }

    // Use admin API to create/update user and generate link
    const email = userInfo.email || `${userInfo.sub}@sipgate.user`;

    // Try to create user - if they exist, Supabase will return an error
    // Then we can just proceed to generate the magic link
    const createUserResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: userInfo.name || userInfo.preferred_username,
            provider: "sipgate",
            sipgate_id: userInfo.sub,
          },
        }),
      }
    );

    if (!createUserResponse.ok) {
      const errorData = await createUserResponse.json();
      // If user already exists, that's fine - we'll just generate a magic link
      if (!errorData.msg?.includes("already been registered") &&
          !errorData.message?.includes("already been registered") &&
          !errorData.error?.includes("already")) {
        console.error("Failed to create user:", JSON.stringify(errorData));
        return NextResponse.redirect(`${appUrl}/login?error=user_creation_failed`);
      }
      // User exists, continue to magic link
    }

    // Generate a magic link for the user (this creates a session)
    // Per Supabase docs: redirect_to is at top level, not in options
    const magicLinkResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/generate_link`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "magiclink",
          email,
          redirect_to: `${appUrl}${redirectTo}`,
        }),
      }
    );

    if (!magicLinkResponse.ok) {
      const errorText = await magicLinkResponse.text();
      console.error("Failed to generate link:", errorText);
      return NextResponse.redirect(`${appUrl}/login?error=session_failed`);
    }

    const linkData = await magicLinkResponse.json();
    console.log("[Sipgate OAuth] Magic link response:", linkData);

    // The action_link from Supabase uses the SITE_URL from dashboard settings,
    // which causes redirects to localhost instead of ngrok.
    //
    // Instead, we redirect to Supabase's verify endpoint with redirect_to pointing
    // to our client-side auth callback page. The verify endpoint will redirect
    // with tokens in the URL fragment, and our callback page will handle them.
    if (linkData.hashed_token) {
      // Construct the verify URL with redirect to our client-side callback
      const verifyUrl = new URL(`${supabaseUrl}/auth/v1/verify`);
      verifyUrl.searchParams.set("token", linkData.hashed_token);
      verifyUrl.searchParams.set("type", linkData.verification_type || "magiclink");
      // Redirect to our client-side callback page which handles fragment tokens
      verifyUrl.searchParams.set("redirect_to", `${appUrl}/auth/callback`);

      console.log("[Sipgate OAuth] Redirecting to verify URL:", verifyUrl.toString());
      return NextResponse.redirect(verifyUrl.toString());
    }

    // Fallback to action_link if hashed_token not available
    if (linkData.action_link) {
      return NextResponse.redirect(linkData.action_link);
    }

    // Fallback: if no action_link, try to extract and use the token
    return NextResponse.redirect(`${appUrl}/login?error=link_generation_failed`);
  } catch (error) {
    console.error("Sipgate OAuth callback error:", error);
    return NextResponse.redirect(`${appUrl}/login?error=callback_error`);
  }
}
