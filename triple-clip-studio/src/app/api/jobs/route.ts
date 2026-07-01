import { NextRequest, NextResponse } from "next/server";
import { listJobs, createJob, getProduct } from "@/lib/repo";
import { getAllSettings } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    productId,
    prompt,
    imageModel,
    videoModel,
    aspectRatio,
    caption,
    tiktokAccountId,
    scheduledAt,
  } = body ?? {};

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  const product = getProduct(productId);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const settings = getAllSettings();
  const job = createJob({
    productId,
    prompt: prompt || "",
    imageModel: imageModel || settings.default_image_model,
    videoModel: videoModel || settings.default_video_model,
    aspectRatio: aspectRatio || "9:16",
    caption: caption || "",
    tiktokAccountId: tiktokAccountId || "",
    scheduledAt: scheduledAt || "",
  });
  return NextResponse.json({ job }, { status: 201 });
}
