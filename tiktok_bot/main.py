"""
Triple Bot — AI TikTok Clip Automation
Pipeline: Gemini Script → Google Veo Video → TikTok Upload

Usage:
    python main.py                          # one-shot with default topic
    python main.py "ความลับของมหาสมุทร"     # custom topic
    python main.py --schedule 6             # run every 6 hours
"""
import argparse
import logging
import os
import sys
import time

import schedule
from dotenv import load_dotenv

load_dotenv()

from bot1_script import ScriptGeneratorBot
from bot2_video import VideoCreatorBot
from bot3_upload import TikTokUploadBot
from config import Config
from utils import setup_logger

logger = setup_logger("TripleBot")


def run_pipeline(topic: str | None = None) -> dict:
    config = Config()
    config.validate()

    topic = topic or config.TOPIC
    logger.info(f"{'='*50}")
    logger.info(f"Triple Bot Pipeline START | Topic: {topic}")
    logger.info(f"{'='*50}")

    # ── Bot 1: Script ─────────────────────────────────────────────────────
    logger.info("[Bot 1/3] Generating script with Gemini...")
    script = ScriptGeneratorBot(config).generate(topic)
    logger.info(f"  Title   : {script.title}")
    logger.info(f"  Hook    : {script.hook}")
    logger.info(f"  Facts   : {len(script.facts)} facts")
    logger.info(f"  Tags    : {' '.join(script.hashtags)}")

    # ── Bot 2: Video ──────────────────────────────────────────────────────
    logger.info("[Bot 2/3] Creating video with Veo + TTS + MoviePy...")
    video_path = VideoCreatorBot(config).create(script)
    logger.info(f"  Video   : {video_path}")

    # ── Bot 3: Upload ─────────────────────────────────────────────────────
    logger.info("[Bot 3/3] Uploading to TikTok...")
    result = TikTokUploadBot(config).upload(video_path, script)
    logger.info(f"  Result  : {result}")

    logger.info(f"{'='*50}")
    logger.info(f"Triple Bot Pipeline DONE")
    logger.info(f"{'='*50}")
    return result


def run_scheduled(interval_hours: int, topic: str | None = None):
    logger.info(f"Scheduled mode: running every {interval_hours} hours")

    # Run immediately on start
    run_pipeline(topic)

    schedule.every(interval_hours).hours.do(run_pipeline, topic=topic)
    while True:
        schedule.run_pending()
        time.sleep(60)


def main():
    parser = argparse.ArgumentParser(
        description="Triple Bot — AI TikTok Clip Automation"
    )
    parser.add_argument("topic", nargs="?", help="Topic for the clip (Thai or English)")
    parser.add_argument(
        "--schedule",
        type=int,
        metavar="HOURS",
        help="Run automatically every N hours",
    )
    args = parser.parse_args()

    if args.schedule:
        run_scheduled(args.schedule, args.topic)
    else:
        run_pipeline(args.topic)


if __name__ == "__main__":
    main()
