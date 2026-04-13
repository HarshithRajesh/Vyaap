"""
Redis-based User Store for Scalable Storage
Solves the memory scalability problem with TTL-based cleanup
"""

import redis
import json
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from ai_pipeline import WhatsAppMessage, InvoiceData

class RedisUserStore:
    """Redis-based user data storage with automatic cleanup"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.message_ttl = 7 * 24 * 3600  # 7 days for messages
        self.user_ttl = 30 * 24 * 3600     # 30 days for user info
        self.duplicate_ttl = 3600           # 1 hour for duplicate checks
        
    def generate_user_id(self, chat_name: str, sender: str) -> str:
        """Generate consistent user ID"""
        content = f"{chat_name}_{sender}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def add_user_message(self, user_id: str, message: WhatsAppMessage):
        """Store message in Redis with TTL"""
        # Store in user's message list
        key = f"user:{user_id}:messages"
        message_data = {
            'text': message.text,
            'sender': message.sender,
            'timestamp': message.timestamp,
            'chat_name': message.chat_name,
            'created_at': datetime.now().isoformat()
        }
        
        # Add to list with TTL
        self.redis.lpush(key, json.dumps(message_data))
        self.redis.expire(key, self.message_ttl)
        
        # Also add to recent messages for similarity checking
        recent_key = f"user:{user_id}:recent"
        self.redis.zadd(recent_key, {
            json.dumps(message_data): datetime.now().timestamp()
        })
        self.redis.expire(recent_key, self.message_ttl)
        
        # Keep only last 50 recent messages
        self.redis.zremrangebyrank(recent_key, 0, -51)
        
        # Update user info
        user_key = f"user:{user_id}:info"
        user_data = {
            'chat_name': message.chat_name,
            'sender': message.sender,
            'last_message': message.text[:100],  # Truncate long messages
            'last_seen': datetime.now().isoformat()
        }
        
        # Use individual hset commands for compatibility
        for field, value in user_data.items():
            self.redis.hset(user_key, field, value)
        
        self.redis.expire(user_key, self.user_ttl)
    
    def check_duplicate(self, message: WhatsAppMessage, threshold: float = 0.8) -> bool:
        """Check for duplicates using Redis"""
        # Option 1: Exact duplicate check
        message_hash = hashlib.md5(f"{message.text}_{message.timestamp}".encode()).hexdigest()
        duplicate_key = f"duplicates:{message_hash}"
        
        if self.redis.exists(duplicate_key):
            return True
        
        # Set duplicate marker with TTL
        self.redis.setex(duplicate_key, self.duplicate_ttl, "1")
        
        # Option 2: Recent similarity check (last 10 messages)
        user_id = self.generate_user_id(message.chat_name, message.sender)
        recent_key = f"user:{user_id}:recent"
        
        # Get recent messages for similarity check
        recent_messages = self.redis.zrevrange(recent_key, 0, 9)  # Last 10 messages
        
        for msg_data in recent_messages:
            try:
                msg = json.loads(msg_data)
                similarity = self.calculate_similarity(message.text, msg['text'])
                if similarity > threshold:
                    return True
            except:
                continue
        
        return False
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Simple similarity calculation (can be enhanced with embeddings)"""
        # For now, use simple word overlap
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union)
    
    def add_user_invoice(self, user_id: str, invoice: InvoiceData):
        """Store invoice in Redis with TTL"""
        invoice_key = f"user:{user_id}:invoices"
        invoice_data = invoice.dict()
        invoice_data['created_at'] = datetime.now().isoformat()
        
        # Add to list with TTL
        self.redis.lpush(invoice_key, json.dumps(invoice_data))
        self.redis.expire(invoice_key, self.user_ttl)
        
        # Also add to recent invoices for quick access
        recent_invoices_key = f"user:{user_id}:recent_invoices"
        self.redis.zadd(recent_invoices_key, {
            json.dumps(invoice_data): datetime.now().timestamp()
        })
        self.redis.expire(recent_invoices_key, self.user_ttl)
        
        # Keep only last 20 recent invoices
        self.redis.zremrangebyrank(recent_invoices_key, 0, -21)
    
    def get_user_messages(self, user_id: str, hours: int = 24) -> List[dict]:
        """Get user messages from Redis"""
        messages_key = f"user:{user_id}:messages"
        
        # Get all messages
        message_data = self.redis.lrange(messages_key, 0, -1)
        
        messages = []
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        for data in message_data:
            try:
                msg = json.loads(data)
                created_at = datetime.fromisoformat(msg['created_at'])
                if created_at >= cutoff_time:
                    messages.append(msg)
            except:
                continue
        
        return messages
    
    def get_user_invoices(self, chat_name: str, hours: int = 24) -> List[InvoiceData]:
        """Get user invoices from Redis"""
        user_id = self.generate_user_id(chat_name, "customer")  # Default to customer
        invoices_key = f"user:{user_id}:invoices"
        
        # Get recent invoices
        cutoff_time = datetime.now() - timedelta(hours=hours)
        invoice_data = self.redis.lrange(invoices_key, 0, -1)
        
        invoices = []
        for data in invoice_data:
            try:
                invoice = json.loads(data)
                created_at = datetime.fromisoformat(invoice['created_at'])
                if created_at >= cutoff_time:
                    invoices.append(InvoiceData(**invoice))
            except:
                continue
        
        return invoices
    
    def get_user_info(self, user_id: str) -> Optional[dict]:
        """Get user information from Redis"""
        user_key = f"user:{user_id}:info"
        info = self.redis.hgetall(user_key)
        
        if info:
            return info
        return None
    
    def get_all_users(self) -> List[dict]:
        """Get all users from Redis"""
        user_keys = self.redis.keys("user:*:info")
        users = []
        
        for key in user_keys:
            info = self.redis.hgetall(key)
            if info:
                user_id = key.split(":")[1]
                info['user_id'] = user_id
                users.append(info)
        
        return users
    
    def cleanup_old_data(self):
        """Clean up very old data (run periodically)"""
        # This is handled automatically by Redis TTL
        # But we can add additional cleanup logic here if needed
        
        # Example: Remove users who haven't been seen in 90 days
        cutoff_time = datetime.now() - timedelta(days=90)
        
        user_keys = self.redis.keys("user:*:info")
        for key in user_keys:
            last_seen = self.redis.hget(key, 'last_seen')
            if last_seen:
                try:
                    last_seen_time = datetime.fromisoformat(last_seen)
                    if last_seen_time < cutoff_time:
                        # Delete all user data
                        user_id = key.split(":")[1]
                        patterns = [
                            f"user:{user_id}:*"
                        ]
                        for pattern in patterns:
                            keys_to_delete = self.redis.keys(pattern)
                            if keys_to_delete:
                                self.redis.delete(*keys_to_delete)
                except:
                    continue
    
    def get_storage_stats(self) -> dict:
        """Get storage statistics"""
        stats = {
            'total_users': len(self.redis.keys("user:*:info")),
            'total_messages': sum(self.redis.llen(key) for key in self.redis.keys("user:*:messages")),
            'total_invoices': sum(self.redis.llen(key) for key in self.redis.keys("user:*:invoices")),
            'memory_usage': self.redis.info('memory')['used_memory_human']
        }
        return stats
