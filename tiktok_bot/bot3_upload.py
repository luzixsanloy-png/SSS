"""
Bot 3: TikTok Uploader
Uses TikTok Content Posting API v2 to upload videos directly.
Docs: https://developers.tiktok.com/doc/content-posting-api-get-started/
"""
import math
import os
import time

import requests

from bot1_script import ScriptData
from config import Config
from utils import retry, setup_logger


TIKTOK_BASE_URL = "https://open.tiktokapis.com/v2"


class TikTokUploadBot:
    """Bot 3 — Uploads video to TikTok via Content Posting API."""

    def __init__(self, config: Config):
        self.config = config
        self.logger = setup_logger("Bot3.TikTok")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {config.TIKTOK_ACCESS_TOKEN}",
            "Content-Type": "application/json; charset=UTF-8",
        })

    def upload(self, video_path: str, script: ScriptData) -> dict:
        """Full upload flow. Returns {publish_id, status}."""
        file_size = os.path.getsize(video_path)
        chunk_size = self.config.CHUNK_SIZE
        total_chunks = math.ceil(file_size / chunk_size)

        self.logger.info(f"Uploading {video_path} ({file_size/1024/1024:.1f} MB, {total_chunks} chunk(s))")

        publish_id, upload_url = self._init_upload(script, file_size, chunk_size, total_chunks)
        self._upload_chunks(video_path, upload_url, file_size, chunk_size, total_chunks)
        status = self._wait_for_publish(publish_id)

        self.logger.info(f"Published! publish_id={publish_id} status={status}")
        return {"publish_id": publish_id, "status": status}

    # ─── Step 1: Init ───────────────────────────────────────────────────────

    @retry(max_attempts=4, backoff=2.0, exceptions=(requests.HTTPError, requests.ConnectionError))
    def _init_upload(self, script: ScriptData, file_size: int, chunk_size: int, total_chunks: int):
        payload = {
            "post_info": {
                "title": script.tiktok_caption[:2200],
                "privacy_level": "PUBLIC_TO_EVERYONE",
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
                "video_cover_timestamp_ms": 1000,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": file_size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunks,
            },
        }

        resp = self.session.post(f"{TIKTOK_BASE_URL}/post/publish/video/init/", json=payload)
        resp.raise_for_status()
        data = resp.json().get("data", {})

        publish_id = data["publish_id"]
        upload_url = data["upload_url"]
        self.logger.info(f"Upload initialized: publish_id={publish_id}")
        return publish_id, upload_url

    # ─── Step 2: Upload chunks ──────────────────────────────────────────────

    def _upload_chunks(self, video_path: str, upload_url: str, file_size: int, chunk_size: int, total_chunks: int):
        with open(video_path, "rb") as f:
            for chunk_idx in range(total_chunks):
                chunk_data = f.read(chunk_size)
                start_byte = chunk_idx * chunk_size
                end_byte = start_byte + len(chunk_data) - 1

                self._upload_single_chunk(upload_url, chunk_data, start_byte, end_byte, file_size)
                self.logger.info(f"Chunk {chunk_idx + 1}/{total_chunks} uploaded")

    @retry(max_attempts=4, backoff=2.0, exceptions=(requests.HTTPError, requests.ConnectionError))
    def _upload_single_chunk(self, upload_url: str, data: bytes, start: int, end: int, total: int):
        resp = requests.put(
            upload_url,
            headers={
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Content-Length": str(len(data)),
                "Content-Type": "video/mp4",
            },
            data=data,
            timeout=120,
        )
        resp.raise_for_status()

    # ─── Step 3: Poll for publish status ────────────────────────────────────

    def _wait_for_publish(self, publish_id: str, timeout: int = 300) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self._check_status(publish_id)
            self.logger.info(f"Publish status: {status}")
            if status in ("PUBLISH_COMPLETE", "SUCCESS"):
                return status
            if status in ("FAILED", "ERROR"):
                raise RuntimeError(f"TikTok publish failed: {status}")
            time.sleep(10)
        raise TimeoutError(f"Publish timed out after {timeout}s")

    @retry(max_attempts=4, backoff=2.0, exceptions=(requests.HTTPError, requests.ConnectionError))
    def _check_status(self, publish_id: str) -> str:
        resp = self.session.post(
            f"{TIKTOK_BASE_URL}/post/publish/status/fetch/",
            json={"publish_id": publish_id},
        )
        resp.raise_for_status()
        return resp.json().get("data", {}).get("status", "UNKNOWN")
