import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
    REDIS_DB = int(os.getenv("REDIS_DB", 0))

    REDIS_INPUT_PATTERN = os.getenv("REDIS_INPUT_PATTERN", "vyaap:queue:raw_chats:*")
    REDIS_INVOICE_PREFIX = os.getenv("REDIS_INVOICE_PREFIX", "vyaap:invoices")
    REDIS_ERROR_PREFIX = os.getenv("REDIS_ERROR_PREFIX", "vyaap:errors")
    REDIS_DEDUP_PREFIX = os.getenv("REDIS_DEDUP_PREFIX", "vyaap:processed_batches")

    CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.5))
    PROCESSED_TTL_HOURS = int(os.getenv("PROCESSED_TTL_HOURS", 24))
    POLL_TIMEOUT_SECONDS = int(os.getenv("POLL_TIMEOUT_SECONDS", 30))

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FILE = os.getenv("LOG_FILE", "ai_pipeline_v2.log")

    @classmethod
    def validate(cls) -> None:
        if not cls.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is required")
