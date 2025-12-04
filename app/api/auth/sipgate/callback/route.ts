import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SIPGATE_TOKEN_URL =
  "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect/token";
const SIPGATE_USERINFO_URL =
  "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect/userinfo";
const SIPGATE_API_URL = "https://api.sipgate.com/v2";

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

    // We'll need the service role key for this
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.redirect(`${appUrl}/login?error=config_error`);
    }

    // Fetch SIP credentials now while we have a valid access token
    // These credentials are static and don't change, so we store them in user_metadata
    let sipCredentials: {
      username: string;
      password: string;
      sipServer: string;
      websocketUrl: string;
      deviceId: string;
      deviceAlias: string;
    } | null = null;

    try {
      // Get devices with credentials
      // First, get the proper userId from the sipgate API (not OIDC userinfo)
      console.log("[Sipgate OAuth] Fetching API userinfo to get userId");

      const apiUserInfoResponse = await fetch(`${SIPGATE_API_URL}/authorization/userinfo`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!apiUserInfoResponse.ok) {
        console.error("[Sipgate OAuth] API userinfo failed:", await apiUserInfoResponse.text());
        throw new Error("Failed to get API userinfo");
      }

      const apiUserInfo = await apiUserInfoResponse.json();
      const userId = apiUserInfo.sub;
      console.log("[Sipgate OAuth] Got userId from API:", userId);

      // Now fetch devices using the API userId
      const devicesResponse = await fetch(`${SIPGATE_API_URL}/${userId}/devices`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      console.log("[Sipgate OAuth] Devices response status:", devicesResponse.status);

      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        console.log("[Sipgate OAuth] Devices data:", JSON.stringify(devicesData, null, 2));

        // Find a REGISTER device with credentials
        const registerDevice = devicesData.items?.find(
          (device: { type: string; credentials?: object }) =>
            device.type === "REGISTER" && device.credentials
        );

        console.log("[Sipgate OAuth] Register device found:", registerDevice?.id);

        if (registerDevice?.credentials) {
          sipCredentials = {
            username: registerDevice.credentials.username,
            password: registerDevice.credentials.password,
            sipServer: registerDevice.credentials.sipServer || "sipgate.de",
            websocketUrl: registerDevice.credentials.sipServerWebsocketUrl || "wss://tls01.sipgate.de:443",
            deviceId: registerDevice.id,
            deviceAlias: registerDevice.alias,
          };
          console.log("[Sipgate OAuth] SIP credentials extracted:", sipCredentials.username);
        } else {
          console.log("[Sipgate OAuth] No REGISTER device with credentials found");
        }
      } else {
        const errorText = await devicesResponse.text();
        console.error("[Sipgate OAuth] Devices API error:", errorText);
      }
    } catch (err) {
      console.error("[Sipgate OAuth] Failed to fetch SIP credentials:", err);
      // Continue without SIP credentials - user can still use the app
    }

    console.log("[Sipgate OAuth] Final sipCredentials:", sipCredentials ? "present" : "null");

    // Use admin API to create/update user and generate link
    const email = userInfo.email || `${userInfo.sub}@sipgate.user`;

    // Prepare user metadata including SIP credentials (fetched at login, never expires)
    const userMetadata = {
      full_name: userInfo.name || userInfo.preferred_username,
      provider: "sipgate",
      sipgate_id: userInfo.sub,
      // Store SIP credentials directly - these don't expire
      sip_credentials: sipCredentials,
    };

    // Try to create user - if they exist, we'll update their metadata
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
          user_metadata: userMetadata,
        }),
      }
    );

    if (!createUserResponse.ok) {
      const errorData = await createUserResponse.json();
      // If user already exists, update their metadata with fresh tokens
      if (errorData.msg?.includes("already been registered") ||
          errorData.message?.includes("already been registered") ||
          errorData.error?.includes("already")) {
        // Get existing user by email and update their metadata
        const getUsersResponse = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
          {
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
          }
        );

        if (getUsersResponse.ok) {
          const usersData = await getUsersResponse.json();
          const existingUser = usersData.users?.[0];
          if (existingUser) {
            // Update user with fresh sipgate tokens
            await fetch(
              `${supabaseUrl}/auth/v1/admin/users/${existingUser.id}`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${serviceRoleKey}`,
                  apikey: serviceRoleKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  user_metadata: userMetadata,
                }),
              }
            );
          }
        }
      } else {
        console.error("Failed to create user:", JSON.stringify(errorData));
        return NextResponse.redirect(`${appUrl}/login?error=user_creation_failed`);
      }
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
