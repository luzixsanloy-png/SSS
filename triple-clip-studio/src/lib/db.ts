import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  var __tripleDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  const database = new DatabaseSync(DB_PATH);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");

  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tiktok_accounts (
      id TEXT PRIMARY KEY,
      open_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      connected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_jobs (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      prompt TEXT DEFAULT '',
      image_model TEXT NOT NULL DEFAULT 'imagen-4.0-generate-001',
      video_model TEXT NOT NULL DEFAULT 'veo-3.0-fast-generate-001',
      aspect_ratio TEXT NOT NULL DEFAULT '9:16',
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      video_path TEXT DEFAULT '',
      error TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      tiktok_account_id TEXT DEFAULT '',
      post_status TEXT NOT NULL DEFAULT 'not_posted',
      tiktok_publish_id TEXT DEFAULT '',
      scheduled_at TEXT DEFAULT '',
      posted_at TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return database;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__tripleDb) {
    globalThis.__tripleDb = createConnection();
  }
  return globalThis.__tripleDb;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  post_interval_minutes: "60",
  auto_post_enabled: "false",
  default_image_model: "imagen-4.0-generate-001",
  default_video_model: "veo-3.0-fast-generate-001",
  default_privacy_level: "SELF_ONLY",
};

export function getSetting(key: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (row) return row.value;
  return DEFAULT_SETTINGS[key] ?? "";
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}
