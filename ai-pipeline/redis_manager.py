"""
Redis Manager for AI Pipeline
"""
import redis
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from config import Config
from models import WhatsAppMessage, InvoiceData

class RedisManager:
    """Manages Redis connections and operations"""

    def __init__(self):
        """Initialize Redis connection"""
        try:
            self.client = redis.Redis(
                host=Config.REDIS_HOST,
                port=Config.REDIS_PORT,
                db=Config.REDIS_DB,
                decode_responses=True
            )
            # Test connection
            self.client.ping()
            logging.info(f"Connected to Redis: {Config.REDIS_HOST}:{Config.REDIS_PORT}")
        except Exception as e:
            logging.error(f"Redis connection failed: {e}")
            raise

    def consume_messages(self, queue_name: str) -> Optional[List[WhatsAppMessage]]:
        """Consume messages from Redis queue"""
        try:
            # Use BLPOP to block and wait for messages
            result = self.client.blpop(queue_name, timeout=30)

            if result:
                _, message_data = result
                msg = json.loads(message_data)

                whatsapp_messages = []

                # Handle both single message and list of messages
                if isinstance(msg, list):
                    # Multiple messages
                    for message_obj in msg:
                        if isinstance(message_obj, dict):
                            whatsapp_msg = WhatsAppMessage(
                                text=message_obj.get('text', ''),
                                sender=message_obj.get('sender', ''),
                                timestamp=message_obj.get('timestamp', ''),
                                chat_name=queue_name  # Extract from queue name
                            )
                            whatsapp_messages.append(whatsapp_msg)
                elif isinstance(msg, dict):
                    # Single message
                    whatsapp_msg = WhatsAppMessage(
                        text=msg.get('text', ''),
                        sender=msg.get('sender', ''),
                        timestamp=msg.get('timestamp', ''),
                        chat_name=queue_name  # Extract from queue name
                    )
                    whatsapp_messages.append(whatsapp_msg)

                logging.info(f"Consumed {len(whatsapp_messages)} messages from {queue_name}")
                return whatsapp_messages

        except Exception as e:
            logging.error(f"Error consuming messages: {e}")
            return None

    def consume_from_all_user_queues(self) -> Optional[Dict[str, Any]]:
        """Consume one item from any user queue."""
        try:
            queue_keys = self.client.keys("vyaap:queue:raw_chats:*")
            if not queue_keys:
                return None

            result = self.client.blpop(queue_keys, timeout=30)
            if not result:
                return None

            queue_key, message_data = result
            payload = json.loads(message_data)

            if not isinstance(payload, dict):
                return None

            return {
                "queue_key": queue_key,
                "user_id": payload.get("userId"),
                "chat_name": payload.get("chatName"),
                "messages": payload.get("messages", []),
                "queued_at": payload.get("queuedAt"),
            }
        except Exception as e:
            logging.error(f"Error consuming from user queues: {e}")
            return None

    def publish_invoice(self, invoice_data: InvoiceData, user_id: str, chat_name: str) -> bool:
        """Publish processed invoice to user-specific invoice queue."""
        try:
            output_key = f"vyaap:invoices:{user_id}"
            invoice_payload = {
                "userId": user_id,
                "chatName": chat_name,
                "status": "pending_verification",
                "processedAt": datetime.now().isoformat(),
                **invoice_data.to_dict(),
            }
            self.client.lpush(output_key, json.dumps(invoice_payload))
            self.client.expire(output_key, 24 * 3600)
            logging.info(f"Published invoice {invoice_data.order_id} to {output_key}")
            return True
        except Exception as e:
            logging.error(f"Error publishing invoice: {e}")
            return False

    def publish_error(self, error_data: Dict[str, Any], user_id: Optional[str] = None) -> bool:
        """Publish error to Redis error queue."""
        try:
            error_key = f"vyaap:errors:{user_id}" if user_id else Config.REDIS_ERROR_QUEUE
            self.client.lpush(error_key, json.dumps(error_data))
            self.client.expire(error_key, 24 * 3600)
            logging.error(f"Published error to queue {error_key}: {error_data}")
            return True
        except Exception as e:
            logging.error(f"Error publishing to error queue: {e}")
            return False

    def check_duplicate_key(self, dedup_key: str) -> bool:
        """Check if message has been processed before"""
        try:
            exists = self.client.exists(f"processed:{dedup_key}")
            return bool(exists)
        except Exception as e:
            logging.error(f"Error checking duplicate: {e}")
            return False

    def mark_processed(self, dedup_key: str, ttl_hours: int = 24) -> bool:
        """Mark message as processed with TTL"""
        try:
            ttl_seconds = ttl_hours * 3600
            self.client.setex(f"processed:{dedup_key}", ttl_seconds, "1")
            return True
        except Exception as e:
            logging.error(f"Error marking processed: {e}")
            return False

    def get_queue_length(self, queue_name: str) -> int:
        """Get current queue length"""
        try:
            return self.client.llen(queue_name)
        except Exception as e:
            logging.error(f"Error getting queue length: {e}")
            return 0

# import redis
# import json
# import logging
# import os
# from typing import Optional, Dict, Any, List
#
# class RedisManager:
#     def __init__(self):
#         try:
#             self.client = redis.Redis(
#                 host=os.getenv('REDIS_HOST', 'localhost'),
#                 port=int(os.getenv('REDIS_PORT', 6379)),
#                 db=0,
#                 decode_responses=True
#             )
#             self.client.ping()
#             logging.info("✅ Connected to Redis")
#         except Exception as e:
#             logging.error(f"❌ Redis connection failed: {e}")
#             raise
#
#     # ✅ NEW: CONSUME FROM ALL USER-SPECIFIC QUEUES
#     def consume_from_all_user_queues(self) -> Optional[Dict[str, Any]]:
#         """
#         Consume messages from all user-specific queues.
#         Queue pattern: vyaap:queue:raw_chats:{userID}:{chatName}
#         """
#         try:
#             # Get all queue keys matching pattern
#             pattern = "vyaap:queue:raw_chats:*"
#             keys = self.client.keys(pattern)
#
#             if not keys:
#                 logging.debug("No user queues found")
#                 return None
#
#             # ✅ BLPOP blocks and waits for message from any queue
#             result = self.client.blpop(keys, timeout=30)
#
#             if result:
#                 queue_key, message_data = result
#                 msg = json.loads(message_data)
#
#                 # ✅ EXTRACT USER CONTEXT
#                 user_id = msg.get('userId')
#                 chat_name = msg.get('chatName')
#                 messages = msg.get('messages', [])
#                 queued_at = msg.get('queuedAt')
#
#                 logging.info(f"📨 Consumed message from user: {user_id}, queue: {queue_key}")
#
#                 return {
#                     'user_id': user_id,
#                     'chat_name': chat_name,
#                     'messages': messages,
#                     'queued_at': queued_at,
#                     'queue_key': queue_key
#                 }
#
#             return None
#
#         except Exception as e:
#             logging.error(f"❌ Error consuming messages: {e}")
#             return None
#
#     # ✅ MODIFIED: PUBLISH INVOICE WITH USER CONTEXT
#     def publish_invoice(self, invoice_data: Dict[str, Any], user_id: str) -> bool:
#         """
#         Publish processed invoice to user-specific queue.
#         Output queue: vyaap:invoices:{userID}
#         """
#         try:
#             # ✅ USER-SPECIFIC OUTPUT QUEUE
#             output_queue = f"vyaap:invoices:{user_id}"
#
#             invoice_json = json.dumps({
#                 'userId': user_id,
#                 'order_id': invoice_data.get('order_id'),
#                 'customer_name': invoice_data.get('customer_name'),
#                 'items': invoice_data.get('items', []),
#                 'total_amount': invoice_data.get('total_amount'),
#                 'delivery_address': invoice_data.get('delivery_address'),
#                 'contact_info': invoice_data.get('contact_info'),
#                 'special_instructions': invoice_data.get('special_instructions'),
#                 'confidence_score': invoice_data.get('confidence_score', 0.0),
#                 'order_date': invoice_data.get('order_date'),
#                 'processed_at': invoice_data.get('processed_at')
#             })
#
#             self.client.lpush(output_queue, invoice_json)
#
#             # ✅ SET TTL ON OUTPUT QUEUE (24 hours)
#             self.client.expire(output_queue, 24 * 3600)
#
#             logging.info(f"✅ Published invoice to queue: {output_queue}")
#             logging.info(f"📋 Invoice JSON:\n{json.dumps(json.loads(invoice_json), indent=2)}")
#
#             return True
#
#         except Exception as e:
#             logging.error(f"❌ Error publishing invoice: {e}")
#             return False
#
#     # ✅ NEW: RETRIEVE INVOICES FOR SPECIFIC USER
#     def get_user_invoices(self, user_id: str, limit: int = 10) -> List[Dict]:
#         """Get all processed invoices for a user"""
#         try:
#             queue_key = f"vyaap:invoices:{user_id}"
#             invoices = self.client.lrange(queue_key, 0, limit - 1)
#
#             result = []
#             for inv in invoices:
#                 result.append(json.loads(inv))
#
#             logging.info(f"📦 Retrieved {len(result)} invoices for user: {user_id}")
#             return result
#
#         except Exception as e:
#             logging.error(f"❌ Error retrieving invoices: {e}")
#             return []
#
#     def publish_error(self, error_data: Dict[str, Any], user_id: str) -> bool:
#         """Publish error to Redis error queue with user context"""
#         try:
#             error_data['userId'] = user_id
#             error_queue = f"vyaap:errors:{user_id}"
#             self.client.lpush(error_queue, json.dumps(error_data))
#             self.client.expire(error_queue, 24 * 3600)
#             logging.error(f"❌ Published error to user queue: {error_queue}")
#             return True
#         except Exception as e:
#             logging.error(f"❌ Error publishing to error queue: {e}")
#             return False
#
#     def check_duplicate_key(self, dedup_key: str) -> bool:
#         """Check if message has been processed before"""
#         try:
#             exists = self.client.exists(f"processed:{dedup_key}")
#             return bool(exists)
#         except Exception as e:
#             logging.error(f"❌ Error checking duplicate: {e}")
#             return False
#
#     def mark_processed(self, dedup_key: str, ttl_hours: int = 24) -> bool:
#         """Mark message as processed with TTL"""
#         try:
#             ttl_seconds = ttl_hours * 3600
#             self.client.setex(f"processed:{dedup_key}", ttl_seconds, "1")
#             return True
#         except Exception as e:
#             logging.error(f"❌ Error marking processed: {e}")
#             return False
