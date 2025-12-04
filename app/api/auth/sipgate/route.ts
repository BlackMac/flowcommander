import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";

const SIPGATE_AUTH_URL =
  "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirectTo") || "/projects";

  // Use NEXT_PUBLIC_APP_URL for the base URL (important for ngrok/production)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  // Generate state for CSRF protection
  const state = nanoid();

  // Store state and redirectTo in cookies for callback verification
  // For OAuth flows with external redirects, we need SameSite=None (requires Secure=true)
  // This ensures cookies persist through the sipgate OAuth redirect chain
  const isSecure = appUrl.startsWith("https://");
  const cookieStore = await cookies();

  // Use SameSite=None for cross-site OAuth redirects when on HTTPS
  // Fall back to Lax for localhost development over HTTP
  const sameSite = isSecure ? "none" : "lax";

  cookieStore.set("sipgate_oauth_state", state, {
    httpOnly: true,
    secure: isSecure,
    sameSite: sameSite,
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });
  cookieStore.set("sipgate_oauth_redirect", redirectTo, {
    httpOnly: true,
    secure: isSecure,
    sameSite: sameSite,
    maxAge: 60 * 10,
    path: "/",
  });

  const clientId = process.env.SIPGATE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${appUrl}/login?error=sipgate_not_configured`
    );
  }

  const callbackUrl = `${appUrl}/api/auth/sipgate/callback`;

  const authUrl = new URL(SIPGATE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
