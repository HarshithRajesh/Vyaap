"""
Redis Manager for AI Pipeline
"""
import redis
import json
import logging
from typing import Optional, List, Dict, Any
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
    
    def publish_invoice(self, invoice_data: InvoiceData) -> bool:
        """Publish processed invoice to Redis queue"""
        try:
            self.client.lpush(Config.REDIS_OUTPUT_QUEUE, invoice_data.to_json())
            logging.info(f"Published invoice {invoice_data.order_id} to output queue")
            return True
        except Exception as e:
            logging.error(f"Error publishing invoice: {e}")
            return False
    
    def publish_error(self, error_data: Dict[str, Any]) -> bool:
        """Publish error to Redis error queue"""
        try:
            self.client.lpush(Config.REDIS_ERROR_QUEUE, json.dumps(error_data))
            logging.error(f"Published error to error queue: {error_data}")
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
