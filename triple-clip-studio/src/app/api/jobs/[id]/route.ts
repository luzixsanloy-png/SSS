import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { deleteJob, getJob } from "@/lib/repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.video_path) {
    const filePath = path.join(process.cwd(), "public", job.video_path.replace(/^\//, ""));
    fs.rm(filePath, { force: true }, () => {});
  }

  deleteJob(id);
  return NextResponse.json({ ok: true });
}
