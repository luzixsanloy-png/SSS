import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizationUrl } from "@/lib/tiktok";

export async function GET() {
  try {
    const state = randomUUID();
    const url = getAuthorizationUrl(state);
    const response = NextResponse.redirect(url);
    response.cookies.set("tiktok_oauth_state", state, {
      httpOnly: true,
      maxAge: 600,
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "TikTok is not configured.";
    return NextResponse.redirect(
      `${process.env.APP_URL || "http://localhost:3000"}/tiktok?error=${encodeURIComponent(message)}`
    );
  }
}
