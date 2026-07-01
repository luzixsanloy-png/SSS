import path from "node:path";
import fs from "node:fs";
import { getAllSettings } from "./db";
import {
  nextQueuedJob,
  nextReadyToPostJob,
  updateJob,
  getProduct,
  getTikTokAccount,
  updateTikTokAccountTokens,
} from "./repo";
import { enhanceProductImage, generateVideoFromImage } from "./googleVideo";
import { publishVideo, checkPublishStatus, refreshAccessToken } from "./tiktok";
import type { VideoPrivacyLevel } from "./tiktok";

const TICK_INTERVAL_MS = 15_000;
const VIDEO_DIR = path.join(process.cwd(), "public", "uploads", "videos");

let lastPostAt = 0;
let ticking = false;

async function processNextGenerationJob() {
  const job = nextQueuedJob();
  if (!job) return;

  const product = getProduct(job.product_id);
  if (!product) {
    updateJob(job.id, { status: "failed", error: "Product not found" });
    return;
  }

  try {
    updateJob(job.id, { status: "generating_image", progress: 5 });
    const imagePath = path.join(process.cwd(), "public", product.image_path.replace(/^\//, ""));
    const enhanced = await enhanceProductImage({
      imagePath,
      prompt: job.prompt,
      model: job.image_model,
    });

    updateJob(job.id, { status: "generating_video", progress: 20 });
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
    const outputFile = `${job.id}.mp4`;
    const outputPath = path.join(VIDEO_DIR, outputFile);

    await generateVideoFromImage({
      imageBytes: enhanced.imageBytes,
      mimeType: enhanced.mimeType,
      prompt: job.prompt,
      model: job.video_model,
      aspectRatio: job.aspect_ratio,
      outputPath,
      onProgress: (pct) => updateJob(job.id, { progress: 20 + Math.round((pct / 100) * 75) }),
    });

    updateJob(job.id, {
      status: "ready",
      progress: 100,
      video_path: `/uploads/videos/${outputFile}`,
      error: "",
    });
  } catch (err) {
    updateJob(job.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function ensureFreshToken(accountId: string): Promise<string> {
  const account = getTikTokAccount(accountId);
  if (!account) throw new Error("TikTok account not connected");

  const expiresAt = new Date(account.expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60_000) return account.access_token;

  const refreshed = await refreshAccessToken(account.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  updateTikTokAccountTokens(
    account.id,
    refreshed.access_token,
    refreshed.refresh_token,
    newExpiresAt
  );
  return refreshed.access_token;
}

async function processNextPostingJob() {
  const settings = getAllSettings();
  if (settings.auto_post_enabled !== "true") return;

  const intervalMs = Number(settings.post_interval_minutes || "60") * 60_000;
  if (Date.now() - lastPostAt < intervalMs) return;

  const job = nextReadyToPostJob();
  if (!job) return;

  try {
    updateJob(job.id, { status: "posting", post_status: "posting" });
    const accessToken = await ensureFreshToken(job.tiktok_account_id);
    const videoPath = path.join(process.cwd(), "public", job.video_path.replace(/^\//, ""));

    const publishId = await publishVideo({
      accessToken,
      videoPath,
      caption: job.caption || job.product_name,
      privacyLevel: settings.default_privacy_level as VideoPrivacyLevel,
    });

    updateJob(job.id, { tiktok_publish_id: publishId });

    // Poll briefly for completion; later ticks reconcile if it's still processing.
    let status = await checkPublishStatus(accessToken, publishId);
    let attempts = 0;
    while (status.status !== "PUBLISH_COMPLETE" && status.status !== "FAILED" && attempts < 6) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      status = await checkPublishStatus(accessToken, publishId);
      attempts += 1;
    }

    if (status.status === "FAILED") {
      updateJob(job.id, {
        status: "failed",
        post_status: "failed",
        error: status.failReason || "TikTok publish failed",
      });
    } else {
      updateJob(job.id, {
        status: "posted",
        post_status: status.status === "PUBLISH_COMPLETE" ? "posted" : "scheduled",
        posted_at: new Date().toISOString(),
      });
    }
    lastPostAt = Date.now();
  } catch (err) {
    updateJob(job.id, {
      status: "failed",
      post_status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    lastPostAt = Date.now();
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await processNextGenerationJob();
    await processNextPostingJob();
  } catch (err) {
    console.error("[scheduler] tick error", err);
  } finally {
    ticking = false;
  }
}

declare global {
  var __tripleScheduler: ReturnType<typeof setInterval> | undefined;
}

export function startScheduler(): void {
  if (globalThis.__tripleScheduler) return;
  console.log("[scheduler] starting background job processor");
  globalThis.__tripleScheduler = setInterval(() => {
    tick();
  }, TICK_INTERVAL_MS);
  tick();
}

export function runTickNow(): Promise<void> {
  return tick();
}
