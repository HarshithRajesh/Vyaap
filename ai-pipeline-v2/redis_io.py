import hashlib
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

import redis

from config import Config
from models import ChatMessage, InvoiceData, QueueBatch


class RedisIO:
    def __init__(self) -> None:
        self.client = redis.Redis(
            host=Config.REDIS_HOST,
            port=Config.REDIS_PORT,
            db=Config.REDIS_DB,
            decode_responses=True,
        )
        self.client.ping()

    def consume_batch(self) -> Optional[QueueBatch]:
        keys = self.client.keys(Config.REDIS_INPUT_PATTERN)
        if not keys:
            return None

        result = self.client.blpop(keys, timeout=Config.POLL_TIMEOUT_SECONDS)
        if not result:
            return None

        queue_key, raw_payload = result
        payload = json.loads(raw_payload)
        user_id = payload.get("userId")
        chat_name = payload.get("chatName")
        messages = payload.get("messages") or []
        queued_at = payload.get("queuedAt") or datetime.now().isoformat()

        if not user_id or not chat_name or not isinstance(messages, list):
            logging.warning("Invalid payload from %s: %s", queue_key, payload)
            return None

        normalized: List[ChatMessage] = []
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            normalized.append(
                ChatMessage(
                    text=msg.get("text", ""),
                    sender=msg.get("sender", ""),
                    timestamp=msg.get("timestamp", ""),
                )
            )

        return QueueBatch(
            user_id=user_id,
            chat_name=chat_name,
            messages=normalized,
            queued_at=queued_at,
            queue_key=queue_key,
        )

    def already_processed(self, batch: QueueBatch) -> bool:
        dedup_key = self._dedup_key(batch)
        return bool(self.client.exists(dedup_key))

    def mark_processed(self, batch: QueueBatch) -> None:
        dedup_key = self._dedup_key(batch)
        ttl_seconds = Config.PROCESSED_TTL_HOURS * 3600
        self.client.setex(dedup_key, ttl_seconds, "1")

    def publish_invoice(self, batch: QueueBatch, invoice: InvoiceData) -> None:
        out_key = f"{Config.REDIS_INVOICE_PREFIX}:{batch.user_id}"
        ui_status = "pending_verification" if invoice.order_intent == "confirmed" else "needs_review"
        payload: Dict[str, object] = {
            "userId": batch.user_id,
            "chatName": batch.chat_name,
            "status": ui_status,
            "processedAt": datetime.now().isoformat(),
            "messageCount": len(batch.messages),
            **invoice.to_dict(),
        }
        self.client.lpush(out_key, json.dumps(payload))
        self.client.expire(out_key, Config.PROCESSED_TTL_HOURS * 3600)

    def publish_error(self, batch: Optional[QueueBatch], error: str) -> None:
        user_id = batch.user_id if batch else "unknown"
        err_key = f"{Config.REDIS_ERROR_PREFIX}:{user_id}"
        payload = {
            "userId": user_id,
            "chatName": batch.chat_name if batch else None,
            "error": error,
            "timestamp": datetime.now().isoformat(),
        }
        self.client.lpush(err_key, json.dumps(payload))
        self.client.expire(err_key, Config.PROCESSED_TTL_HOURS * 3600)

    def _dedup_key(self, batch: QueueBatch) -> str:
        # Include queued_at so each new extraction attempt (different timestamp)
        # gets a unique dedup key even if the same messages are re-extracted.
        joined = "\n".join(f"{m.timestamp}|{m.sender}|{m.text}" for m in batch.messages)
        digest = hashlib.sha256(
            f"{batch.user_id}|{batch.chat_name}|{batch.queued_at}|{joined}".encode("utf-8")
        ).hexdigest()
        return f"{Config.REDIS_DEDUP_PREFIX}:{digest}"
