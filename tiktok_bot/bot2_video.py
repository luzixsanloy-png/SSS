"""
Bot 2: Video Creator
1. Google Veo  — generates talking-head style background video
2. gTTS        — generates Thai voiceover (TTS)
3. MoviePy     — assembles video + audio + TikTok-style word-group subtitles
"""
import math
import os
import re
import time

from google import genai
from google.genai import types
from gtts import gTTS
from moviepy.editor import (
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    VideoFileClip,
    concatenate_videoclips,
)
from PIL import Image, ImageDraw, ImageFont
import numpy as np

from bot1_script import ScriptData
from config import Config
from utils import get_output_path, retry, setup_logger

# TikTok subtitle style constants
SUBTITLE_FONT_SIZE = 52
SUBTITLE_TEXT_COLOR = (255, 255, 255, 255)       # white
SUBTITLE_HIGHLIGHT_COLOR = (255, 220, 0, 255)    # yellow — current word
SUBTITLE_BG_COLOR = (0, 0, 0, 175)              # semi-transparent black pill
SUBTITLE_PADDING = (24, 14)                      # horizontal, vertical
SUBTITLE_RADIUS = 18                             # pill corner radius
SUBTITLE_WORDS_PER_GROUP = 4                     # words shown at once
SUBTITLE_Y_RATIO = 0.74                          # vertical position (% of height)


class VideoCreatorBot:
    """Bot 2 — Creates the final TikTok video with talking-head + styled subtitles."""

    VEO_POLL_INTERVAL = 15
    VEO_TIMEOUT = 600

    def __init__(self, config: Config):
        self.config = config
        self.logger = setup_logger("Bot2.Video")
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)

    def create(self, script: ScriptData) -> str:
        base = _safe_filename(script.title)
        raw_video_path = get_output_path(self.config.OUTPUT_DIR, f"{base}_raw.mp4")
        audio_path = get_output_path(self.config.OUTPUT_DIR, f"{base}_voice.mp3")
        final_path = get_output_path(self.config.OUTPUT_DIR, f"{base}_final.mp4")

        self.logger.info("Step 1/3: Generating talking-head video with Veo...")
        self._generate_veo_video(script.veo_prompt, raw_video_path)

        self.logger.info("Step 2/3: Generating Thai TTS voiceover...")
        self._generate_tts(script.voiceover, audio_path)

        self.logger.info("Step 3/3: Assembling with TikTok-style subtitles...")
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
                raise TimeoutError("Veo generation timed out")
            self.logger.info("Veo generating... checking in 15s")
            time.sleep(self.VEO_POLL_INTERVAL)
            operation = self.client.operations.get(operation)

        videos = operation.response.generated_videos
        if not videos:
            raise RuntimeError("Veo returned no videos")

        import urllib.request
        urllib.request.urlretrieve(videos[0].video.uri, output_path)
        self.logger.info(f"Veo video saved: {output_path}")

    # ─── TTS ────────────────────────────────────────────────────────────────

    def _generate_tts(self, text: str, output_path: str):
        gTTS(text=text, lang=self.config.LANGUAGE, slow=False).save(output_path)

    # ─── Assembly ───────────────────────────────────────────────────────────

    def _assemble(self, video_path: str, audio_path: str, script: ScriptData, output_path: str):
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)
        audio_dur = audio.duration

        # Loop Veo clip if shorter than narration
        if video.duration < audio_dur:
            loops = math.ceil(audio_dur / video.duration)
            video = concatenate_videoclips([video] * loops)
        video = video.subclip(0, audio_dur)

        subtitle_clips = self._build_subtitle_clips(script.voiceover, audio_dur, video.size)

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
        for clip in [video, audio, final]:
            clip.close()

    # ─── TikTok-style subtitles ──────────────────────────────────────────────

    def _build_subtitle_clips(self, voiceover: str, total_dur: float, video_size: tuple) -> list:
        """
        Split voiceover into groups of N words, assign equal time slices,
        render each as a styled pill card (CapCut-inspired).
        """
        words = voiceover.split()
        if not words:
            return []

        groups = [
            words[i : i + SUBTITLE_WORDS_PER_GROUP]
            for i in range(0, len(words), SUBTITLE_WORDS_PER_GROUP)
        ]
        time_per_group = total_dur / len(groups)
        width, height = video_size
        y_pos = int(height * SUBTITLE_Y_RATIO)

        clips = []
        for idx, group in enumerate(groups):
            img = self._render_pill_card(" ".join(group), width)
            clip = (
                ImageClip(np.array(img))
                .set_start(idx * time_per_group)
                .set_duration(time_per_group)
                .set_position(("center", y_pos))
            )
            clips.append(clip)
        return clips

    def _render_pill_card(self, text: str, video_width: int) -> Image.Image:
        """Render a single subtitle group as a pill-shaped card on transparent bg."""
        font = _load_font(SUBTITLE_FONT_SIZE)
        px, py = SUBTITLE_PADDING

        # Measure text
        dummy = Image.new("RGBA", (1, 1))
        dd = ImageDraw.Draw(dummy)
        bbox = dd.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        pill_w = text_w + px * 2
        pill_h = text_h + py * 2
        canvas_w = max(pill_w + 20, video_width)
        canvas_h = pill_h + 20

        img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Draw pill background (rounded rectangle)
        x0 = (canvas_w - pill_w) // 2
        y0 = 10
        x1 = x0 + pill_w
        y1 = y0 + pill_h
        _draw_rounded_rect(draw, x0, y0, x1, y1, SUBTITLE_RADIUS, SUBTITLE_BG_COLOR)

        # Draw text — shadow then main
        tx = canvas_w // 2
        ty = y0 + py
        draw.text((tx + 2, ty + 2), text, font=font, fill=(0, 0, 0, 180), anchor="mt")
        draw.text((tx, ty), text, font=font, fill=SUBTITLE_TEXT_COLOR, anchor="mt")

        return img


# ─── Helpers ────────────────────────────────────────────────────────────────

def _draw_rounded_rect(draw, x0, y0, x1, y1, radius, fill):
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/thai/Garuda.ttf",
        "/usr/share/fonts/truetype/thai/Norasi.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _safe_filename(title: str) -> str:
    return re.sub(r"[^\w฀-๿]", "_", title)[:40]
