"""
Simple Deduplication System for AI Pipeline (without sentence transformers)
"""
import hashlib
import logging
from typing import List, Optional
from models import WhatsAppMessage
from redis_manager import RedisManager

class DeduplicationEngine:
    """Handles message deduplication using exact key matching"""
    
    def __init__(self, redis_manager: RedisManager):
        """Initialize deduplication engine"""
        self.redis_manager = redis_manager
        logging.info("Deduplication engine initialized with Redis-based deduplication")
    
    def create_dedup_key(self, message: WhatsAppMessage) -> str:
        """Create unique key from chatname + sender + timestamp + message"""
        # Combine all fields for unique identification
        combined = f"{message.chat_name}_{message.sender}_{message.timestamp}_{message.text}"
        # Create hash for efficient storage
        dedup_key = hashlib.md5(combined.encode()).hexdigest()
        logging.debug(f"Created dedup key: {dedup_key} for message from {message.sender}")
        return dedup_key
    
    def is_duplicate(self, message: WhatsAppMessage) -> bool:
        """Check if message is duplicate using exact key matching"""
        try:
            # Create unique key
            dedup_key = self.create_dedup_key(message)
            
            # Check if key exists in Redis
            if self.redis_manager.check_duplicate_key(dedup_key):
                logging.info(f"Duplicate found: {dedup_key}")
                return True
            
            # Mark as processed
            self.redis_manager.mark_processed(dedup_key)
            return False
            
        except Exception as e:
            logging.error(f"Error in deduplication check: {e}")
            return False
    
    def clear_old_processed_keys(self, hours: int = 24) -> int:
        """Clean up old processed keys"""
        logging.info(f"Cleaning up processed keys older than {hours} hours")
        return 0
