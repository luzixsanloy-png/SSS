import fs from "node:fs";

/**
 * Thin client around TikTok's official Login Kit (OAuth2) and
 * Content Posting API. Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 *
 * Requires a TikTok Developer app with the `video.publish` and
 * `user.info.basic` scopes approved, plus TIKTOK_CLIENT_KEY /
 * TIKTOK_CLIENT_SECRET / TIKTOK_REDIRECT_URI configured in the environment.
 */

const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"];

export type VideoPrivacyLevel =
  | "SELF_ONLY"
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

export function getAuthorizationUrl(state: string): string {
  const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
  const redirectUri = requireEnv("TIKTOK_REDIRECT_URI");
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = requireEnv("TIKTOK_CLIENT_SECRET");
  const redirectUri = requireEnv("TIKTOK_REDIRECT_URI");

  const response = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || data.error) {
    throw new Error(data.error_description || "Failed to exchange TikTok authorization code.");
  }
  return data;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = requireEnv("TIKTOK_CLIENT_SECRET");

  const response = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || data.error) {
    throw new Error(data.error_description || "Failed to refresh TikTok access token.");
  }
  return data;
}

export async function getUserInfo(
  accessToken: string
): Promise<{ open_id: string; display_name: string; avatar_url: string }> {
  const response = await fetch(
    `${API_BASE}/user/info/?fields=open_id,display_name,avatar_url`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = await response.json();
  if (!response.ok || json.error?.code !== "ok") {
    throw new Error(json.error?.message || "Failed to fetch TikTok user info.");
  }
  return json.data.user;
}

interface PublishInitResponse {
  data: { publish_id: string; upload_url: string };
  error: { code: string; message: string };
}

/**
 * Publishes a locally-stored video file to TikTok via Direct Post
 * (FILE_UPLOAD source). Returns the publish_id used to poll status.
 */
export async function publishVideo(opts: {
  accessToken: string;
  videoPath: string;
  caption: string;
  /**
   * TikTok requires apps to complete an audit before they may post
   * publicly on a user's behalf. Unaudited apps are restricted to
   * SELF_ONLY (private, visible only to the poster). See:
   * https://developers.tiktok.com/doc/content-posting-api-get-started
   */
  privacyLevel?: VideoPrivacyLevel;
}): Promise<string> {
  const stat = fs.statSync(opts.videoPath);
  const videoSize = stat.size;

  const initResponse = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: opts.caption,
        privacy_level: opts.privacyLevel ?? "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  });

  const initJson = (await initResponse.json()) as PublishInitResponse;
  if (!initResponse.ok || initJson.error?.code !== "ok") {
    throw new Error(initJson.error?.message || "Failed to initialize TikTok upload.");
  }

  const { publish_id, upload_url } = initJson.data;
  const videoBuffer = fs.readFileSync(opts.videoPath);

  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`TikTok video upload failed with status ${uploadResponse.status}.`);
  }

  return publish_id;
}

export type PublishStatus =
  | "PROCESSING_DOWNLOAD"
  | "PROCESSING_UPLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export async function checkPublishStatus(
  accessToken: string,
  publishId: string
): Promise<{ status: PublishStatus; failReason?: string }> {
  const response = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const json = await response.json();
  if (!response.ok || json.error?.code !== "ok") {
    throw new Error(json.error?.message || "Failed to check TikTok publish status.");
  }
  return {
    status: json.data.status,
    failReason: json.data.fail_reason,
  };
}

export function isTikTokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY &&
      process.env.TIKTOK_CLIENT_SECRET &&
      process.env.TIKTOK_REDIRECT_URI
  );
}
