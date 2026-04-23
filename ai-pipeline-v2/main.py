import logging
import sys
import time
from typing import Optional

from config import Config
from gemini_client import GeminiClient
from models import QueueBatch
from redis_io import RedisIO


class PipelineV2:
    def __init__(self) -> None:
        Config.validate()
        self.redis = RedisIO()
        self.gemini = GeminiClient()
        if not self.gemini.test_connection():
            raise RuntimeError("Gemini connection test failed")

    def run(self) -> None:
        logging.info("AI Pipeline v2 started")
        logging.info("Listening on pattern: %s", Config.REDIS_INPUT_PATTERN)
        while True:
            batch: Optional[QueueBatch] = None
            try:
                batch = self.redis.consume_batch()
                if not batch:
                    continue
                if not batch.messages:
                    logging.info("Skipping empty batch from %s", batch.queue_key)
                    continue

                if self.redis.already_processed(batch):
                    logging.info("Skipping duplicate batch: %s", batch.queue_key)
                    continue

                combined = self._combine_batch(batch)
                default_contact = self._default_contact(batch)
                invoice = self.gemini.extract_invoice(combined, default_contact)

                if invoice.confidence_score < Config.CONFIDENCE_THRESHOLD:
                    logging.warning(
                        "Low confidence (%.2f) for user=%s chat=%s",
                        invoice.confidence_score,
                        batch.user_id,
                        batch.chat_name,
                    )

                self.redis.publish_invoice(batch, invoice)
                self.redis.mark_processed(batch)
                logging.info(
                    "Published invoice order_id=%s user=%s chat=%s",
                    invoice.order_id,
                    batch.user_id,
                    batch.chat_name,
                )
            except Exception as exc:
                logging.exception("Batch processing failed: %s", exc)
                self.redis.publish_error(batch, str(exc))
                time.sleep(0.5)

    @staticmethod
    def _combine_batch(batch: QueueBatch) -> str:
        lines = []
        for msg in batch.messages:
            sender = msg.sender or "unknown"
            ts = msg.timestamp or "-"
            text = (msg.text or "").strip()
            if text:
                lines.append(f"[{ts}] {sender}: {text}")
        return "\n".join(lines)

    @staticmethod
    def _default_contact(batch: QueueBatch) -> str:
        for msg in reversed(batch.messages):
            if msg.sender:
                return msg.sender
        return batch.chat_name


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, Config.LOG_LEVEL, logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(Config.LOG_FILE),
        ],
    )


def main() -> None:
    setup_logging()
    logging.info("Starting AI Pipeline v2")
    pipeline = PipelineV2()
    pipeline.run()


if __name__ == "__main__":
    main()
