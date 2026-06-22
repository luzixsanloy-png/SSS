"""
Bot 2: Video Creator
1. Google Veo  — generates background video from prompt
2. gTTS        — generates Thai voiceover audio
3. MoviePy     — assembles video + audio + subtitle overlay
"""
import os
import textwrap
import time
from pathlib import Path

from google import genai
from google.genai import types
from gtts import gTTS
from moviepy.editor import (
    VideoFileClip,
    AudioFileClip,
    ImageClip,
    CompositeVideoClip,
    concatenate_videoclips,
)
from PIL import Image, ImageDraw, ImageFont
import numpy as np

from bot1_script import ScriptData
from config import Config
from utils import get_output_path, retry, setup_logger


class VideoCreatorBot:
    """Bot 2 — Creates the final TikTok video."""

    VEO_POLL_INTERVAL = 15  # seconds between Veo status checks
    VEO_TIMEOUT = 600       # 10 minutes max

    def __init__(self, config: Config):
        self.config = config
        self.logger = setup_logger("Bot2.Video")
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)

    def create(self, script: ScriptData) -> str:
        """Full pipeline: Veo → TTS → assemble. Returns final video path."""
        base_name = self._safe_filename(script.title)

        raw_video_path = get_output_path(self.config.OUTPUT_DIR, f"{base_name}_raw.mp4")
        audio_path = get_output_path(self.config.OUTPUT_DIR, f"{base_name}_voice.mp3")
        final_path = get_output_path(self.config.OUTPUT_DIR, f"{base_name}_final.mp4")

        self.logger.info("Step 1/3: Generating Veo background video...")
        self._generate_veo_video(script.veo_prompt, raw_video_path)

        self.logger.info("Step 2/3: Generating Thai TTS audio...")
        self._generate_tts(script.voiceover, audio_path)

        self.logger.info("Step 3/3: Assembling final video with subtitles...")
        self._assemble(raw_video_path, audio_path, script, final_path)

        self.logger.info(f"Video ready: {final_path}")
        return final_path

    # ─── Veo ────────────────────────────────────────────────────────────────

    @retry(max_attempts=3, backoff=4.0)
    def _generate_veo_video(self, prompt: str, output_path: str):
        operation = self.client.models.generate_videos(
            model=self.config.VEO_MODEL,
            prompt=prompt,
            config=types.GenerateVideoConfig(
                aspect_ratio=self.config.VIDEO_ASPECT_RATIO,
                duration_seconds=self.config.VIDEO_DURATION,
                number_of_videos=1,
                enhance_prompt=True,
            ),
        )

        deadline = time.time() + self.VEO_TIMEOUT
        while not operation.done:
            if time.time() > deadline:
                raise TimeoutError("Veo video generation timed out")
            self.logger.info("Veo generating... waiting 15s")
            time.sleep(self.VEO_POLL_INTERVAL)
            operation = self.client.operations.get(operation)

        videos = operation.response.generated_videos
        if not videos:
            raise RuntimeError("Veo returned no videos")

        video_uri = videos[0].video.uri
        self.logger.info(f"Downloading Veo video: {video_uri}")
        self._download_file(video_uri, output_path)

    def _download_file(self, uri: str, dest: str):
        import urllib.request
        urllib.request.urlretrieve(uri, dest)

    # ─── TTS ────────────────────────────────────────────────────────────────

    def _generate_tts(self, text: str, output_path: str):
        tts = gTTS(text=text, lang=self.config.LANGUAGE, slow=False)
        tts.save(output_path)

    # ─── Assembly ───────────────────────────────────────────────────────────

    def _assemble(self, video_path: str, audio_path: str, script: ScriptData, output_path: str):
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)

        # Loop or trim video to match audio duration
        audio_duration = audio.duration
        if video.duration < audio_duration:
            loops = int(audio_duration / video.duration) + 1
            video = concatenate_videoclips([video] * loops)
        video = video.subclip(0, audio_duration)

        # Build subtitle clips
        subtitle_clips = self._build_subtitles(script, audio_duration, video.size)

        # Compose
        final = CompositeVideoClip([video] + subtitle_clips)
        final = final.set_audio(audio)
        final.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            fps=30,
            preset="fast",
            logger=None,
        )

        video.close()
        audio.close()
        final.close()

    def _build_subtitles(self, script: ScriptData, total_duration: float, video_size: tuple) -> list:
        """Split voiceover into timed subtitle segments as ImageClips."""
        sentences = [s.strip() for s in script.voiceover.replace(".", ".\n").split("\n") if s.strip()]
        if not sentences:
            return []

        per_sentence = total_duration / len(sentences)
        clips = []
        width, height = video_size

        for i, sentence in enumerate(sentences):
            start = i * per_sentence
            img = self._render_subtitle_image(sentence, width, height)
            clip = (
                ImageClip(np.array(img))
                .set_start(start)
                .set_duration(per_sentence)
                .set_position(("center", int(height * 0.72)))
            )
            clips.append(clip)

        return clips

    def _render_subtitle_image(self, text: str, width: int, height: int) -> Image.Image:
        """Render subtitle text onto a transparent RGBA image."""
        img = Image.new("RGBA", (width, 160), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        font_size = max(28, width // 22)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()

        wrapped = textwrap.fill(text, width=28)

        # Shadow
        shadow_offset = 2
        draw.text((width // 2 + shadow_offset, 20 + shadow_offset), wrapped, font=font,
                  fill=(0, 0, 0, 200), anchor="mt", align="center")
        # Main text
        draw.text((width // 2, 20), wrapped, font=font,
                  fill=(255, 255, 255, 255), anchor="mt", align="center")

        return img

    # ─── Helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _safe_filename(title: str) -> str:
        import re
        return re.sub(r"[^\w฀-๿]", "_", title)[:40]
