import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Product, TikTokAccount, VideoJob, VideoJobWithProduct } from "./types";

const nowIso = () => new Date().toISOString();

// ---- Products ----

export function listProducts(): Product[] {
  return getDb()
    .prepare("SELECT * FROM products ORDER BY created_at DESC")
    .all() as unknown as Product[];
}

export function getProduct(id: string): Product | undefined {
  return getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as
    | Product
    | undefined;
}

export function createProduct(input: {
  name: string;
  description: string;
  imagePath: string;
}): Product {
  const id = randomUUID();
  const created_at = nowIso();
  getDb()
    .prepare(
      "INSERT INTO products (id, name, description, image_path, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, input.name, input.description, input.imagePath, created_at);
  return { id, name: input.name, description: input.description, image_path: input.imagePath, created_at };
}

export function deleteProduct(id: string): void {
  getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
}

// ---- TikTok accounts ----

export function listTikTokAccounts(): TikTokAccount[] {
  return getDb()
    .prepare("SELECT * FROM tiktok_accounts ORDER BY connected_at DESC")
    .all() as unknown as TikTokAccount[];
}

export function getTikTokAccount(id: string): TikTokAccount | undefined {
  return getDb().prepare("SELECT * FROM tiktok_accounts WHERE id = ?").get(id) as
    | TikTokAccount
    | undefined;
}

export function upsertTikTokAccount(input: {
  openId: string;
  displayName: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}): TikTokAccount {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM tiktok_accounts WHERE open_id = ?")
    .get(input.openId) as TikTokAccount | undefined;

  if (existing) {
    db.prepare(
      `UPDATE tiktok_accounts
       SET display_name = ?, avatar_url = ?, access_token = ?, refresh_token = ?, expires_at = ?
       WHERE id = ?`
    ).run(
      input.displayName,
      input.avatarUrl,
      input.accessToken,
      input.refreshToken,
      input.expiresAt,
      existing.id
    );
    return { ...existing, ...input, display_name: input.displayName, avatar_url: input.avatarUrl, access_token: input.accessToken, refresh_token: input.refreshToken, expires_at: input.expiresAt };
  }

  const id = randomUUID();
  const connected_at = nowIso();
  db.prepare(
    `INSERT INTO tiktok_accounts (id, open_id, display_name, avatar_url, access_token, refresh_token, expires_at, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.openId,
    input.displayName,
    input.avatarUrl,
    input.accessToken,
    input.refreshToken,
    input.expiresAt,
    connected_at
  );
  return {
    id,
    open_id: input.openId,
    display_name: input.displayName,
    avatar_url: input.avatarUrl,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    expires_at: input.expiresAt,
    connected_at,
  };
}

export function updateTikTokAccountTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): void {
  getDb()
    .prepare(
      "UPDATE tiktok_accounts SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = ?"
    )
    .run(accessToken, refreshToken, expiresAt, id);
}

export function deleteTikTokAccount(id: string): void {
  getDb().prepare("DELETE FROM tiktok_accounts WHERE id = ?").run(id);
}

// ---- Video jobs ----

export function listJobs(): VideoJobWithProduct[] {
  return getDb()
    .prepare(
      `SELECT j.*, p.name as product_name, p.image_path as product_image_path
       FROM video_jobs j
       JOIN products p ON p.id = j.product_id
       ORDER BY j.created_at DESC`
    )
    .all() as unknown as VideoJobWithProduct[];
}

export function getJob(id: string): VideoJob | undefined {
  return getDb().prepare("SELECT * FROM video_jobs WHERE id = ?").get(id) as
    | VideoJob
    | undefined;
}

export function createJob(input: {
  productId: string;
  prompt: string;
  imageModel: string;
  videoModel: string;
  aspectRatio: string;
  caption: string;
  tiktokAccountId: string;
  scheduledAt: string;
}): VideoJob {
  const id = randomUUID();
  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO video_jobs
        (id, product_id, prompt, image_model, video_model, aspect_ratio, status, progress,
         video_path, error, caption, tiktok_account_id, post_status, tiktok_publish_id,
         scheduled_at, posted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, '', '', ?, ?, 'not_posted', '', ?, '', ?, ?)`
    )
    .run(
      id,
      input.productId,
      input.prompt,
      input.imageModel,
      input.videoModel,
      input.aspectRatio,
      input.caption,
      input.tiktokAccountId,
      input.scheduledAt,
      timestamp,
      timestamp
    );
  return getJob(id) as VideoJob;
}

export function updateJob(id: string, fields: Partial<VideoJob>): void {
  const keys = Object.keys(fields) as (keyof VideoJob)[];
  if (keys.length === 0) return;
  const setClause = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => fields[key] ?? null) as (string | number | null)[];
  getDb()
    .prepare(`UPDATE video_jobs SET ${setClause}, updated_at = ? WHERE id = ?`)
    .run(...values, nowIso(), id);
}

export function deleteJob(id: string): void {
  getDb().prepare("DELETE FROM video_jobs WHERE id = ?").run(id);
}

export function countJobsByStatus(): { queued: number; processing: number; posted: number; failed: number } {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) as count FROM video_jobs GROUP BY status")
    .all() as { status: string; count: number }[];

  const result = { queued: 0, processing: 0, posted: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "queued") result.queued += row.count;
    else if (row.status === "posted") result.posted += row.count;
    else if (row.status === "failed") result.failed += row.count;
    else result.processing += row.count;
  }
  return result;
}

export function nextQueuedJob(): VideoJob | undefined {
  return getDb()
    .prepare("SELECT * FROM video_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
    .get() as VideoJob | undefined;
}

export function nextReadyToPostJob(): VideoJobWithProduct | undefined {
  return getDb()
    .prepare(
      `SELECT j.*, p.name as product_name, p.image_path as product_image_path
       FROM video_jobs j
       JOIN products p ON p.id = j.product_id
       WHERE j.status = 'ready' AND j.post_status = 'not_posted' AND j.tiktok_account_id != ''
         AND (j.scheduled_at = '' OR j.scheduled_at <= ?)
       ORDER BY j.created_at ASC LIMIT 1`
    )
    .get(nowIso()) as VideoJobWithProduct | undefined;
}
