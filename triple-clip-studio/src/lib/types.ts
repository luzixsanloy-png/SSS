export interface Product {
  id: string;
  name: string;
  description: string;
  image_path: string;
  created_at: string;
}

export interface TikTokAccount {
  id: string;
  open_id: string;
  display_name: string;
  avatar_url: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
}

export type JobStatus =
  | "queued"
  | "generating_image"
  | "generating_video"
  | "ready"
  | "posting"
  | "posted"
  | "failed";

export type PostStatus = "not_posted" | "scheduled" | "posting" | "posted" | "failed";

export interface VideoJob {
  id: string;
  product_id: string;
  prompt: string;
  image_model: string;
  video_model: string;
  aspect_ratio: string;
  status: JobStatus;
  progress: number;
  video_path: string;
  error: string;
  caption: string;
  tiktok_account_id: string;
  post_status: PostStatus;
  tiktok_publish_id: string;
  scheduled_at: string;
  posted_at: string;
  created_at: string;
  updated_at: string;
}

export interface VideoJobWithProduct extends VideoJob {
  product_name: string;
  product_image_path: string;
}
