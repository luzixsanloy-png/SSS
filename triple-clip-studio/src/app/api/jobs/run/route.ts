import { NextResponse } from "next/server";
import { runTickNow } from "@/lib/scheduler";

export async function POST() {
  // Kick the queue immediately rather than waiting for the next
  // background tick. Generation/posting still happens asynchronously.
  runTickNow().catch((err) => console.error("[jobs/run] tick failed", err));
  return NextResponse.json({ ok: true });
}
