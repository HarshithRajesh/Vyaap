"""
AI Pipeline for WhatsApp Message Processing
Extracts invoice information from Hinglish WhatsApp messages
"""

import redis
import json
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class WhatsAppMessage:
    """Structure for WhatsApp message"""
    text: str
    sender: str
    timestamp: str
    chat_name: str

class InvoiceData(BaseModel):
    """Structure for extracted invoice information"""
    order_id: str
    customer_name: Optional[str] = None
    items: List[Dict[str, Any]] = []
    total_amount: Optional[float] = None
    order_date: Optional[str] = None
    delivery_address: Optional[str] = None
    contact_info: Optional[str] = None
    special_instructions: Optional[str] = None
    confidence_score: float = 0.0

class UserVectorStore:
    """Vector database for user tracking and deduplication"""
    
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.dimension = 384  # Embedding dimension
        self.index = faiss.IndexFlatL2(self.dimension)
        self.user_data = {}  # user_id -> user_info
        self.message_embeddings = []  # Store embeddings for deduplication
        
    def generate_user_id(self, chat_name: str, contact_info: str = None) -> str:
        """Generate unique user ID"""
        content = f"{chat_name}_{contact_info or 'unknown'}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def add_user_message(self, user_id: str, message: WhatsAppMessage):
        """Add message to user's vector store"""
        # Create embedding
        text_embedding = self.model.encode([message.text])
        
        # Add to FAISS index
        self.index.add(text_embedding)
        
        # Store user data
        if user_id not in self.user_data:
            self.user_data[user_id] = {
                'chat_name': message.chat_name,
                'messages': [],
                'invoices': [],
                'last_updated': datetime.now()
            }
        
        self.user_data[user_id]['messages'].append(message)
        self.user_data[user_id]['last_updated'] = datetime.now()
        
    def check_duplicate(self, message: WhatsAppMessage, threshold: float = 0.8) -> bool:
        """Check if message is duplicate"""
        if self.index.ntotal == 0:
            return False
            
        # Get embedding for new message
        new_embedding = self.model.encode([message.text])
        
        # Search for similar messages
        distances, indices = self.index.search(new_embedding, k=5)
        
        # Check if any message is too similar
        for distance in distances[0]:
            similarity = 1 - distance  # Convert distance to similarity
            if similarity > threshold:
                return True
        
        return False
    
    def get_user_messages(self, user_id: str, hours: int = 24) -> List[WhatsAppMessage]:
        """Get user messages from last N hours"""
        if user_id not in self.user_data:
            return []
        
        cutoff_time = datetime.now() - timedelta(hours=hours)
        messages = self.user_data[user_id]['messages']
        
        filtered_messages = []
        for msg in messages:
            try:
                msg_time = datetime.strptime(msg.timestamp, '%H:%M')
                today_msg_time = datetime.now().replace(
                    hour=msg_time.hour, minute=msg_time.minute, second=0, microsecond=0
                )
                
                if today_msg_time >= cutoff_time:
                    filtered_messages.append(msg)
            except:
                continue
                
        return filtered_messages

class HinglishTextProcessor:
    """Process and normalize Hinglish text"""
    
    def __init__(self):
        self.common_words = {
            'bhaiya': 'brother',
            'pack': 'package',
            'karo': 'do',
            'dena': 'give',
            'lena': 'take',
            'price': 'price',
            'rs': 'rupees',
            'rs.': 'rupees',
            'rupay': 'rupees',
            'delivery': 'delivery',
            'address': 'address',
            'order': 'order',
            'please': 'please',
            'thank': 'thank',
            'thanks': 'thanks'
        }
    
    def normalize_text(self, text: str) -> str:
        """Normalize Hinglish text"""
        # Convert to lowercase
        text = text.lower()
        
        # Replace common Hinglish words
        for hinglish, english in self.common_words.items():
            text = text.replace(hinglish, english)
        
        # Remove extra spaces and special characters
        text = ' '.join(text.split())
        
        return text
    
    def extract_numbers(self, text: str) -> List[int]:
        """Extract numbers from text"""
        import re
        numbers = re.findall(r'\d+', text)
        return [int(num) for num in numbers]
    
    def extract_prices(self, text: str) -> List[float]:
        """Extract prices from text"""
        import re
        # Match patterns like "2 blue dupatta pack karo" or "price 500"
        price_patterns = [
            r'(\d+)\s*(?:rs|rs\.|rupay|rupees)',
            r'(?:price|rate|cost)\s*(\d+)',
            r'(\d+)\s*(?:rupees|rs|rs\.|rupay)'
        ]
        
        prices = []
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    prices.append(float(match))
                except:
                    continue
        
        return prices

class AIInvoiceExtractor:
    """AI-powered invoice information extraction"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self.text_processor = HinglishTextProcessor()
        
    def extract_invoice_info(self, message: WhatsAppMessage) -> InvoiceData:
        """Extract invoice information from WhatsApp message"""
        normalized_text = self.text_processor.normalize_text(message.text)
        numbers = self.text_processor.extract_numbers(normalized_text)
        prices = self.text_processor.extract_prices(normalized_text)
        
        # Create structured invoice data
        invoice = InvoiceData(
            order_id=str(uuid.uuid4())[:8],
            order_date=datetime.now().strftime('%Y-%m-%d'),
            confidence_score=0.0
        )
        
        # Extract items (basic pattern matching)
        items = self._extract_items(normalized_text, numbers)
        invoice.items = items
        
        # Calculate total amount
        if prices:
            invoice.total_amount = max(prices)
        
        # Extract customer name (if available)
        invoice.customer_name = self._extract_customer_name(normalized_text)
        
        # Extract delivery instructions
        invoice.special_instructions = self._extract_instructions(normalized_text)
        
        # Calculate confidence score
        invoice.confidence_score = self._calculate_confidence(invoice, normalized_text)
        
        return invoice
    
    def _extract_items(self, text: str, numbers: List[int]) -> List[Dict[str, Any]]:
        """Extract items from message"""
        items = []
        
        # Simple pattern matching for items
        # Example: "2 blue dupatta pack karo"
        if len(numbers) > 0:
            quantity = numbers[0]
            
            # Extract item description
            words = text.split()
            item_desc = []
            
            # Look for item description after quantity
            for i, word in enumerate(words):
                if word.isdigit() and i < len(words) - 1:
                    # Get next few words as item description
                    for j in range(i+1, min(i+4, len(words))):
                        if words[j] not in ['karo', 'dena', 'please', 'pack']:
                            item_desc.append(words[j])
                        else:
                            break
                    break
            
            if item_desc:
                items.append({
                    'quantity': quantity,
                    'description': ' '.join(item_desc),
                    'unit_price': None,
                    'total_price': None
                })
        
        return items
    
    def _extract_customer_name(self, text: str) -> Optional[str]:
        """Extract customer name from message"""
        # Simple pattern matching for names
        # This is a basic implementation - can be enhanced with NLP
        import re
        
        # Look for patterns like "name is John" or "I am John"
        name_patterns = [
            r'(?:my name is|i am|i\'m)\s+([a-zA-Z\s]+)',
            r'name\s+is\s+([a-zA-Z\s]+)',
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_instructions(self, text: str) -> Optional[str]:
        """Extract special instructions"""
        instructions = []
        
        # Look for delivery instructions
        if 'delivery' in text or 'address' in text:
            instructions.append("Delivery instruction found")
        
        # Look for urgency indicators
        if 'urgent' in text or 'asap' in text or 'jaldi' in text:
            instructions.append("Urgent order")
        
        return '; '.join(instructions) if instructions else None
    
    def _calculate_confidence(self, invoice: InvoiceData, text: str) -> float:
        """Calculate confidence score for extraction"""
        score = 0.0
        
        # Items extracted
        if invoice.items:
            score += 0.4
        
        # Price extracted
        if invoice.total_amount:
            score += 0.3
        
        # Customer name extracted
        if invoice.customer_name:
            score += 0.2
        
        # Instructions extracted
        if invoice.special_instructions:
            score += 0.1
        
        return min(score, 1.0)

class AIPipeline:
    """Main AI Pipeline for WhatsApp message processing"""
    
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379):
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
        self.vector_store = UserVectorStore()
        self.invoice_extractor = AIInvoiceExtractor()
        self.processed_messages = set()
        
        # Redis queue names
        self.input_queue = "vyaap:queue:raw_chats:test_neo"
        self.output_queue = "vyaap:queue:processed_invoices"
        self.error_queue = "vyaap:queue:processing_errors"
        
    def publish_invoice(self, invoice: InvoiceData, original_message: WhatsAppMessage):
        """Publish processed invoice back to Redis"""
        try:
            # Create output message with invoice data
            output_data = {
                "order_id": invoice.order_id,
                "chat_name": original_message.chat_name,
                "original_message": {
                    "text": original_message.text,
                    "sender": original_message.sender,
                    "timestamp": original_message.timestamp
                },
                "extracted_invoice": invoice.dict(),
                "processing_timestamp": datetime.now().isoformat(),
                "confidence_score": invoice.confidence_score
            }
            
            # Publish to output queue
            self.redis_client.rpush(self.output_queue, json.dumps(output_data))
            print(f"[AI_PIPELINE] Published invoice {invoice.order_id} to Redis")
            
        except Exception as e:
            print(f"[AI_PIPELINE] Error publishing invoice: {e}")
            # Publish to error queue
            error_data = {
                "error": str(e),
                "invoice_data": invoice.dict(),
                "original_message": original_message.__dict__,
                "timestamp": datetime.now().isoformat()
            }
            self.redis_client.rpush(self.error_queue, json.dumps(error_data))
    
    def start_worker(self):
        """Start the AI pipeline worker"""
        print("[AI_PIPELINE] Starting AI Pipeline Worker...")
        
        try:
            # Test Redis connection
            self.redis_client.ping()
            print("[AI_PIPELINE] Connected to Redis successfully")
        except Exception as e:
            print(f"AI_PIPELINE] Redis Connection Error: {e}")
            return
        
        while True:
            try:
                # Wait for messages from Redis
                task = self.redis_client.blpop(self.input_queue, timeout=0)
                
                if task:
                    raw_data = task[1]
                    self.process_message(raw_data)
                    
            except Exception as e:
                print(f"[AI_PIPELINE] Error processing message: {e}")
                continue
    
    def process_message(self, raw_data: str):
        """Process a single WhatsApp message"""
        try:
            # Parse JSON data
            data = json.loads(raw_data)
            chat_name = data.get('chatName', 'unknown')
            messages = data.get('messages', [])
            
            for msg_data in messages:
                # Create WhatsApp message object
                message = WhatsAppMessage(
                    text=msg_data.get('text', ''),
                    sender=msg_data.get('sender', 'unknown'),
                    timestamp=msg_data.get('timestamp', ''),
                    chat_name=chat_name
                )
                
                # Generate user ID
                user_id = self.vector_store.generate_user_id(chat_name, message.sender)
                
                # Check for duplicates
                message_hash = hashlib.md5(f"{message.text}_{message.timestamp}".encode()).hexdigest()
                if message_hash in self.processed_messages:
                    print(f"[AI_PIPELINE] Duplicate message skipped: {message.text[:50]}...")
                    continue
                
                # Check for similar messages
                if self.vector_store.check_duplicate(message):
                    print(f"[AI_PIPELINE] Similar message skipped: {message.text[:50]}...")
                    continue
                
                # Add to vector store
                self.vector_store.add_user_message(user_id, message)
                
                # Extract invoice information
                invoice = self.invoice_extractor.extract_invoice_info(message)
                
                # Store invoice
                if user_id in self.vector_store.user_data:
                    self.vector_store.user_data[user_id]['invoices'].append(invoice)
                
                # Publish invoice back to Redis
                self.publish_invoice(invoice, message)
                
                # Mark as processed
                self.processed_messages.add(message_hash)
                
                # Output results
                print(f"\n[AI_PIPELINE] New Message Processed:")
                print(f"Chat: {chat_name}")
                print(f"Message: {message.text}")
                print(f"Extracted Invoice: {invoice.dict()}")
                print(f"Confidence: {invoice.confidence_score:.2f}")
                print(f"Published to Redis queue: {self.output_queue}")
                print("-" * 50)
                
        except Exception as e:
            print(f"[AI_PIPELINE] Error processing message: {e}")
    
    def get_user_invoices(self, chat_name: str, hours: int = 24) -> List[InvoiceData]:
        """Get invoices for a user in the last N hours"""
        user_id = self.vector_store.generate_user_id(chat_name)
        
        if user_id not in self.vector_store.user_data:
            return []
        
        # Get recent invoices
        cutoff_time = datetime.now() - timedelta(hours=hours)
        invoices = self.vector_store.user_data[user_id]['invoices']
        
        recent_invoices = []
        for invoice in invoices:
            # This is simplified - in production, we'd store creation time
            recent_invoices.append(invoice)
        
        return recent_invoices
    
    def generate_revenue_report(self, chat_name: str, days: int = 7) -> Dict[str, Any]:
        """Generate revenue report for a user"""
        user_id = self.vector_store.generate_user_id(chat_name)
        
        if user_id not in self.vector_store.user_data:
            return {"error": "User not found"}
        
        invoices = self.vector_store.user_data[user_id]['invoices']
        
        total_revenue = 0
        total_orders = len(invoices)
        items_sold = []
        
        for invoice in invoices:
            if invoice.total_amount:
                total_revenue += invoice.total_amount
            
            for item in invoice.items:
                items_sold.append(item)
        
        return {
            "chat_name": chat_name,
            "period_days": days,
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "unique_items": len(set(item['description'] for item in items_sold)),
            "average_order_value": total_revenue / total_orders if total_orders > 0 else 0
        }

if __name__ == "__main__":
    # Start the AI Pipeline
    pipeline = AIPipeline()
    pipeline.start_worker()
