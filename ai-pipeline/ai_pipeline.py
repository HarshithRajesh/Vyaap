"""
Main AI Pipeline for WhatsApp Message Processing
Consumes from Redis, extracts invoice info using Gemini, publishes output
"""
import logging
import time
import sys
from datetime import datetime
from typing import Optional, Dict, Any

# Import our modules
from config import Config
from models import WhatsAppMessage, InvoiceData
from redis_manager import RedisManager
from deduplication_simple import DeduplicationEngine
from gemini_extractor_fixed import GeminiExtractor

class AIPipeline:
    """Main AI Pipeline class"""
    
    def __init__(self):
        """Initialize AI pipeline"""
        try:
            # Validate configuration
            Config.validate()
            
            # Initialize components
            self.redis_manager = RedisManager()
            self.dedup_engine = DeduplicationEngine(self.redis_manager)
            self.gemini_extractor = GeminiExtractor()
            
            # Test connections
            self._test_connections()
            
            logging.info("AI Pipeline initialized successfully")
            
        except Exception as e:
            logging.error(f"Failed to initialize AI Pipeline: {e}")
            sys.exit(1)
    
    def _test_connections(self):
        """Test all connections"""
        logging.info("Testing connections...")
        
        # Test Gemini connection
        if not self.gemini_extractor.test_connection():
            raise Exception("Gemini connection failed")
        
        # Test Redis connection
        queue_length = self.redis_manager.get_queue_length(Config.REDIS_INPUT_QUEUE)
        logging.info(f"Redis connection OK. Default queue length: {queue_length}")
        
        logging.info("All connections tested successfully")
    
    def process_message(self, message: WhatsAppMessage, user_id: Optional[str] = None) -> Optional[InvoiceData]:
        """Process a single message"""
        try:
            logging.info(f"Processing message from {message.sender}: {message.text[:50]}...")
            
            # Check for duplicates
            if self.dedup_engine.is_duplicate(message):
                logging.info(f"Skipping duplicate message: {message.sender}")
                return None
            
            # Extract invoice data using Gemini
            invoice_data = self.gemini_extractor.extract_invoice_data(
                message.text, message.sender
            )
            
            # Validate confidence score
            if invoice_data.confidence_score < Config.CONFIDENCE_THRESHOLD:
                logging.warning(f"Low confidence score: {invoice_data.confidence_score}")
                # Still process but mark as low confidence
            
            logging.info(f"Successfully extracted invoice: {invoice_data.order_id}")
            return invoice_data
            
        except Exception as e:
            logging.error(f"Error processing message: {e}")
            # Publish error to Redis
            error_data = {
                "error": str(e),
                "message": message.__dict__,
                "timestamp": datetime.now().isoformat()
            }
            self.redis_manager.publish_error(error_data, user_id=user_id)
            return None
    
    def publish_invoice(self, invoice_data: InvoiceData, user_id: str, chat_name: str) -> bool:
        """Publish processed invoice to Redis"""
        try:
            success = self.redis_manager.publish_invoice(invoice_data, user_id, chat_name)
            if success:
                logging.info(f"Published invoice {invoice_data.order_id} for user {user_id}")
            return success
        except Exception as e:
            logging.error(f"Error publishing invoice: {e}")
            return False

    def _to_whatsapp_message(self, raw_message: Dict[str, Any], chat_name: str) -> WhatsAppMessage:
        """Convert Redis message payload to WhatsAppMessage model."""
        return WhatsAppMessage(
            text=raw_message.get("text", ""),
            sender=raw_message.get("sender", ""),
            timestamp=raw_message.get("timestamp", ""),
            chat_name=chat_name,
        )

    def _merge_batch_messages(self, raw_messages: list, chat_name: str) -> Optional[WhatsAppMessage]:
        """Merge a chat batch into one message so one batch creates one invoice."""
        normalized = []
        senders = []
        timestamps = []

        for raw_message in raw_messages:
            if not isinstance(raw_message, dict):
                continue
            msg = self._to_whatsapp_message(raw_message, chat_name)
            if not msg.text:
                continue
            normalized.append(msg.text)
            if msg.sender:
                senders.append(msg.sender)
            if msg.timestamp:
                timestamps.append(msg.timestamp)

        if not normalized:
            return None

        sender = senders[-1] if senders else chat_name
        timestamp = timestamps[-1] if timestamps else datetime.now().isoformat()
        combined_text = "\n".join(normalized)
        return WhatsAppMessage(
            text=combined_text,
            sender=sender,
            timestamp=timestamp,
            chat_name=chat_name,
        )
    
    def run(self):
        """Main processing loop"""
        logging.info("Starting AI Pipeline main loop...")
        logging.info("Listening to all queues matching vyaap:queue:raw_chats:*")
        
        try:
            while True:
                # Consume one message bundle from any user queue
                queue_payload = self.redis_manager.consume_from_all_user_queues()
                if queue_payload:
                    user_id = queue_payload.get("user_id")
                    chat_name = queue_payload.get("chat_name") or "unknown-chat"
                    raw_messages = queue_payload.get("messages") or []

                    if not user_id or not isinstance(raw_messages, list):
                        logging.warning(f"Skipping malformed queue payload: {queue_payload}")
                        continue

                    merged_message = self._merge_batch_messages(raw_messages, chat_name)
                    if not merged_message:
                        logging.warning(f"Skipping empty message batch for queue payload: {queue_payload}")
                        continue

                    invoice_data = self.process_message(merged_message, user_id=user_id)
                    if invoice_data:
                        self.publish_invoice(invoice_data, user_id=user_id, chat_name=chat_name)
                
                # Small delay to prevent CPU overload
                time.sleep(0.1)
                
        except KeyboardInterrupt:
            logging.info("Shutting down AI Pipeline...")
        except Exception as e:
            logging.error(f"Fatal error in main loop: {e}")
            sys.exit(1)

def setup_logging():
    """Setup logging configuration"""
    logging.basicConfig(
        level=getattr(logging, Config.LOG_LEVEL),
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(Config.LOG_FILE),
            logging.StreamHandler(sys.stdout)
        ]
    )

def main():
    """Main entry point"""
    print("🚀 Starting AI Pipeline for WhatsApp Invoice Extraction")
    print(f"📥 Input Queue: {Config.REDIS_INPUT_QUEUE}")
    print(f"📤 Output Queue: {Config.REDIS_OUTPUT_QUEUE}")
    print(f"🤖 AI Model: {Config.GEMINI_MODEL}")
    print("-" * 50)
    
    # Setup logging
    setup_logging()
    
    try:
        # Create and run pipeline
        pipeline = AIPipeline()
        pipeline.run()
        
    except Exception as e:
        logging.error(f"Pipeline startup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
