import { NextResponse } from "next/server";
import { deleteTikTokAccount, getTikTokAccount } from "@/lib/repo";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = getTikTokAccount(id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteTikTokAccount(id);
  return NextResponse.json({ ok: true });
}
