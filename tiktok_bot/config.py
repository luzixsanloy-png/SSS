import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Google AI
    GEMINI_API_KEY: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    GEMINI_MODEL: str = "gemini-2.0-flash"
    VEO_MODEL: str = "veo-2.0-generate-001"

    # TikTok API
    TIKTOK_CLIENT_KEY: str = field(default_factory=lambda: os.getenv("TIKTOK_CLIENT_KEY", ""))
    TIKTOK_CLIENT_SECRET: str = field(default_factory=lambda: os.getenv("TIKTOK_CLIENT_SECRET", ""))
    TIKTOK_ACCESS_TOKEN: str = field(default_factory=lambda: os.getenv("TIKTOK_ACCESS_TOKEN", ""))

    # Bot settings
    TOPIC: str = field(default_factory=lambda: os.getenv("TOPIC", "เรื่องจริงที่ไม่มีใครเชื่อว่าเกิดขึ้น"))
    LANGUAGE: str = "th"  # Thai
    OUTPUT_DIR: str = "output"
    # Veo generates 8s clips; Bot 2 loops them to match the full voiceover length (~40-60s)
    VIDEO_DURATION: int = 8
    CHUNK_SIZE: int = 10 * 1024 * 1024  # 10MB chunks for TikTok upload

    # Veo video config
    VIDEO_ASPECT_RATIO: str = "9:16"  # TikTok vertical format
    VIDEO_RESOLUTION: str = "1080p"

    # Retry
    MAX_RETRIES: int = 4
    RETRY_BACKOFF: float = 2.0  # seconds, doubles each retry

    def validate(self):
        missing = []
        if not self.GEMINI_API_KEY:
            missing.append("GEMINI_API_KEY")
        if not self.TIKTOK_ACCESS_TOKEN:
            missing.append("TIKTOK_ACCESS_TOKEN")
        if missing:
            raise ValueError(f"Missing required env vars: {', '.join(missing)}")
