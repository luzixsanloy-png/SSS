import { NextResponse } from "next/server";
import { listTikTokAccounts } from "@/lib/repo";
import { isTikTokConfigured } from "@/lib/tiktok";

export async function GET() {
  const accounts = listTikTokAccounts().map((account) => ({
    id: account.id,
    open_id: account.open_id,
    display_name: account.display_name,
    avatar_url: account.avatar_url,
    connected_at: account.connected_at,
  }));
  return NextResponse.json({ accounts, configured: isTikTokConfigured() });
}
