import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@/lib/db";
import { isTikTokConfigured } from "@/lib/tiktok";

const ALLOWED_KEYS = new Set([
  "post_interval_minutes",
  "auto_post_enabled",
  "default_image_model",
  "default_video_model",
  "default_privacy_level",
]);

export async function GET() {
  return NextResponse.json({
    settings: getAllSettings(),
    tiktokConfigured: isTikTokConfigured(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  for (const [key, value] of Object.entries(body ?? {})) {
    if (ALLOWED_KEYS.has(key)) {
      setSetting(key, String(value));
    }
  }
  return NextResponse.json({ settings: getAllSettings() });
}
