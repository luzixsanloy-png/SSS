import logging
import time
import os
from functools import wraps


def setup_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


def retry(max_attempts: int = 4, backoff: float = 2.0, exceptions=(Exception,)):
    """Exponential backoff retry decorator."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            logger = setup_logger("retry")
            delay = backoff
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_attempts:
                        raise
                    logger.warning(f"{fn.__name__} failed (attempt {attempt}/{max_attempts}): {e} — retrying in {delay:.0f}s")
                    time.sleep(delay)
                    delay *= 2
        return wrapper
    return decorator


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def get_output_path(output_dir: str, filename: str) -> str:
    ensure_dir(output_dir)
    return os.path.join(output_dir, filename)
