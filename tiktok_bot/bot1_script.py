"""
Bot 1: Script Generator
Uses Gemini AI to generate a story-style TikTok script (hook → setup → twist → lesson)
with a talking-head Veo prompt and voiceover text.
"""
import json
import re
from dataclasses import dataclass, field

from google import genai
from google.genai import types

from config import Config
from utils import setup_logger, retry


@dataclass
class ScriptData:
    title: str
    hook: str                   # Opening line — scroll-stopper
    story_beats: list[dict]     # [{"beat": "setup|conflict|twist|resolution", "text": "..."}]
    voiceover: str              # Full continuous TTS text (Thai)
    hashtags: list[str]
    veo_prompt: str             # English prompt for Veo (talking head style)
    tiktok_caption: str         # title + hashtags for TikTok post


class ScriptGeneratorBot:
    """Bot 1 — Generates story scripts via Gemini for talking-head TikTok clips."""

    SYSTEM_PROMPT = (
        "คุณคือ TikTok scriptwriter ระดับ viral ที่เชี่ยวชาญการเล่าเรื่องแบบ Storytelling "
        "สำหรับคนไทย สไตล์: เหมือนคนเล่าให้เพื่อนฟัง ธรรมชาติ อารมณ์ลึก มี twist "
        "ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น"
    )

    USER_TEMPLATE = """เขียนสคริปต์คลิป TikTok แบบ Storytelling เรื่อง: "{topic}"

ต้องการ JSON รูปแบบนี้:
{{
  "title": "ชื่อคลิปภาษาไทย น่าสนใจ ≤55 ตัวอักษร",
  "hook": "ประโยคเปิด 1 ประโยค ดึงคนหยุดเลื่อนใน 2 วินาที — ต้องสร้างคำถามหรือความอยากรู้",
  "story_beats": [
    {{"beat": "setup",      "text": "แนะนำตัวละคร/สถานการณ์ (2-3 ประโยค)"}},
    {{"beat": "conflict",   "text": "ปัญหาหรือจุดเปลี่ยน (2-3 ประโยค)"}},
    {{"beat": "twist",      "text": "สิ่งที่ไม่มีใครคาด หรือ reveal ที่น่าตกใจ (1-2 ประโยค)"}},
    {{"beat": "resolution", "text": "บทเรียน บทสรุป หรือ CTA กระตุ้นกดติดตาม (1-2 ประโยค)"}}
  ],
  "voiceover": "ข้อความบรรยายต่อเนื่องภาษาไทย ราบรื่น อ่านออกเสียงได้สะดวก ไม่มีสัญลักษณ์พิเศษ ความยาว 40-60 วินาที",
  "hashtags": ["#เรื่องเล่า", "#เกร็ดความรู้", "#TikTokไทย", "#viral", "#ฟังเลย"],
  "veo_prompt": "Vertical 9:16 video, close-up portrait of a confident young Thai presenter in their 20s speaking directly to camera, natural hand gestures, warm soft studio lighting, modern minimalist background, authentic engaging storytelling expression, shallow depth of field, no text overlay, 8 seconds"
}}

กฎสำคัญ:
- hook ต้องทำให้คนอยากดูต่อ เช่น เริ่มด้วย "ถ้าคุณ...", "มีคนๆ หนึ่ง...", "ในปี...มีเหตุการณ์..."
- voiceover ต้องเชื่อมทุก beat เป็นเรื่องเดียวกันลื่นไหล ไม่ขาดตอน
- twist ต้องสร้าง aha moment จริงๆ
- veo_prompt ให้ใส่ theme ของ "{topic_en}" ใน background หรือ wardrobe เล็กน้อย"""

    def __init__(self, config: Config):
        self.config = config
        self.logger = setup_logger("Bot1.Script")
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)

    @retry(max_attempts=4, backoff=2.0)
    def generate(self, topic: str) -> ScriptData:
        self.logger.info(f"Generating story script | topic: {topic}")
        topic_en = self._to_english(topic)
        prompt = self.USER_TEMPLATE.format(topic=topic, topic_en=topic_en)

        response = self.client.models.generate_content(
            model=self.config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=self.SYSTEM_PROMPT,
                temperature=0.9,
                max_output_tokens=1500,
            ),
        )

        data = self._parse_json(response.text.strip())
        script = self._build(data)
        self.logger.info(f"Script ready: {script.title}")
        self.logger.info(f"Hook: {script.hook}")
        return script

    def _to_english(self, topic: str) -> str:
        r = self.client.models.generate_content(
            model=self.config.GEMINI_MODEL,
            contents=f"Translate to English in 5 words or less: {topic}",
        )
        return r.text.strip().strip('"')

    def _parse_json(self, raw: str) -> dict:
        match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
        if match:
            raw = match.group(1)
        return json.loads(raw)

    def _build(self, data: dict) -> ScriptData:
        hashtags = data.get("hashtags", ["#เรื่องเล่า", "#TikTok"])
        caption = data["title"] + "\n\n" + " ".join(hashtags)
        return ScriptData(
            title=data["title"],
            hook=data["hook"],
            story_beats=data.get("story_beats", []),
            voiceover=data["voiceover"],
            hashtags=hashtags,
            veo_prompt=data["veo_prompt"],
            tiktok_caption=caption,
        )
