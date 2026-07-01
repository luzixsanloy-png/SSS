import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getUserInfo } from "@/lib/tiktok";
import { upsertTikTokAccount } from "@/lib/repo";

function redirectTo(request: NextRequest, error?: string) {
  const base = new URL("/tiktok", request.url);
  if (error) base.searchParams.set("error", error);
  return NextResponse.redirect(base);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("tiktok_oauth_state")?.value;
  const errorParam = request.nextUrl.searchParams.get("error_description");

  if (errorParam) return redirectTo(request, errorParam);
  if (!code) return redirectTo(request, "Missing authorization code from TikTok.");
  if (!state || state !== storedState) {
    return redirectTo(request, "Invalid OAuth state. Please try connecting again.");
  }

  try {
    const token = await exchangeCodeForToken(code);
    const user = await getUserInfo(token.access_token);
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    upsertTikTokAccount({
      openId: token.open_id || user.open_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
    });

    const response = redirectTo(request);
    response.cookies.delete("tiktok_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect TikTok account.";
    return redirectTo(request, message);
  }
}
