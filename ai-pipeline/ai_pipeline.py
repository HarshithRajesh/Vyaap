"""
Main AI Pipeline for WhatsApp Message Processing
Consumes from Redis, extracts invoice info using Gemini, publishes output
"""
import logging
import time
import sys
from datetime import datetime
from typing import Optional

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
        logging.info(f"Redis connection OK. Queue length: {queue_length}")
        
        logging.info("All connections tested successfully")
    
    def process_message(self, message: WhatsAppMessage) -> Optional[InvoiceData]:
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
            self.redis_manager.publish_error(error_data)
            return None
    
    def publish_invoice(self, invoice_data: InvoiceData) -> bool:
        """Publish processed invoice to Redis"""
        try:
            success = self.redis_manager.publish_invoice(invoice_data)
            if success:
                logging.info(f"Published invoice {invoice_data.order_id} to output queue")
            return success
        except Exception as e:
            logging.error(f"Error publishing invoice: {e}")
            return False
    
    def run(self):
        """Main processing loop"""
        logging.info("Starting AI Pipeline main loop...")
        logging.info(f"Listening to queue: {Config.REDIS_INPUT_QUEUE}")
        
        try:
            while True:
                # Consume messages from Redis
                messages = self.redis_manager.consume_messages(Config.REDIS_INPUT_QUEUE)
                
                if messages:
                    for message in messages:
                        # Process each message
                        invoice_data = self.process_message(message)
                        
                        if invoice_data:
                            # Publish to output queue
                            self.publish_invoice(invoice_data)
                
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
