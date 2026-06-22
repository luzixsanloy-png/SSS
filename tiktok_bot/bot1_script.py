"""
Bot 1: Script Generator
Uses Gemini AI to generate a fact-based TikTok script with voiceover and video prompt.
"""
import json
import re
from dataclasses import dataclass

from google import genai
from google.genai import types

from config import Config
from utils import setup_logger, retry


@dataclass
class ScriptData:
    title: str
    hook: str           # First 3 seconds — attention grabber
    facts: list[str]    # 3–5 punchy facts
    voiceover: str      # Full TTS text (Thai)
    hashtags: list[str]
    veo_prompt: str     # English prompt for Veo video generation
    tiktok_caption: str # Caption with title + hashtags


class ScriptGeneratorBot:
    """Bot 1 — Generates fact scripts via Gemini."""

    SYSTEM_PROMPT = """คุณคือ TikTok content creator ผู้เชี่ยวชาญสร้างคลิปความรู้สั้น ๆ ที่ viral
สไตล์: สั้น กระชับ น่าตกใจ เข้าใจง่าย ดึงดูดคนไทย
ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น"""

    USER_TEMPLATE = """สร้างสคริปต์คลิป TikTok ความรู้ เรื่อง: "{topic}"

ต้องการ JSON ในรูปแบบนี้:
{{
  "title": "ชื่อคลิปภาษาไทย (สั้น น่าสนใจ ≤60 ตัวอักษร)",
  "hook": "ประโยคเปิดดึงดูดใน 3 วินาทีแรก (ภาษาไทย)",
  "facts": ["fact1", "fact2", "fact3"],
  "voiceover": "ข้อความบรรยายเสียงทั้งหมดภาษาไทย (15-20 วินาที ราบรื่น ไม่มีสัญลักษณ์พิเศษ)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "veo_prompt": "Cinematic 9:16 vertical video for TikTok about {topic_en}. Style: modern, dynamic, visually stunning. 8 seconds. No text overlay. High quality."
}}"""

    def __init__(self, config: Config):
        self.config = config
        self.logger = setup_logger("Bot1.Script")
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)

    @retry(max_attempts=4, backoff=2.0)
    def generate(self, topic: str) -> ScriptData:
        self.logger.info(f"Generating script for topic: {topic}")

        # Derive English topic for Veo prompt
        topic_en = self._translate_topic_to_en(topic)

        prompt = self.USER_TEMPLATE.format(topic=topic, topic_en=topic_en)

        response = self.client.models.generate_content(
            model=self.config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=self.SYSTEM_PROMPT,
                temperature=0.8,
                max_output_tokens=1024,
            ),
        )

        raw = response.text.strip()
        data = self._parse_json(raw)
        script = self._build_script(data)
        self.logger.info(f"Script ready: {script.title}")
        return script

    def _translate_topic_to_en(self, topic: str) -> str:
        """Quick translation for Veo prompt (English only)."""
        response = self.client.models.generate_content(
            model=self.config.GEMINI_MODEL,
            contents=f"Translate this to English in 5 words or less: {topic}",
        )
        return response.text.strip().strip('"')

    def _parse_json(self, raw: str) -> dict:
        # Strip markdown code fences if present
        match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
        if match:
            raw = match.group(1)
        return json.loads(raw)

    def _build_script(self, data: dict) -> ScriptData:
        hashtags = data.get("hashtags", ["#ความรู้", "#TikTok", "#fact"])
        caption = data["title"] + "\n\n" + " ".join(hashtags)
        return ScriptData(
            title=data["title"],
            hook=data["hook"],
            facts=data["facts"],
            voiceover=data["voiceover"],
            hashtags=hashtags,
            veo_prompt=data["veo_prompt"],
            tiktok_caption=caption,
        )
