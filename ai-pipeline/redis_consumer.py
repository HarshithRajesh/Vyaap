"""
Redis Consumer for Processed Invoices
Consumes invoices from the AI pipeline output queue
"""

import redis
import json
from datetime import datetime
from typing import Dict, Any

class InvoiceConsumer:
    """Consumer for processed invoices from Redis"""
    
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379):
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
        
        # Queue names
        self.output_queue = "vyaap:queue:processed_invoices"
        self.error_queue = "vyaap:queue:processing_errors"
        
    def start_consumer(self):
        """Start consuming processed invoices"""
        print("[CONSUMER] Starting invoice consumer...")
        
        try:
            # Test Redis connection
            self.redis_client.ping()
            print("[CONSUMER] Connected to Redis successfully")
        except Exception as e:
            print(f"[CONSUMER] Redis Connection Error: {e}")
            return
        
        while True:
            try:
                # Wait for processed invoices
                task = self.redis_client.blpop(self.output_queue, timeout=0)
                
                if task:
                    invoice_data = task[1]
                    self.process_invoice(invoice_data)
                    
            except Exception as e:
                print(f"[CONSUMER] Error consuming invoice: {e}")
                continue
    
    def process_invoice(self, invoice_data: str):
        """Process a single invoice from the queue"""
        try:
            # Parse invoice data
            data = json.loads(invoice_data)
            
            print(f"\n[CONSUMER] Received Processed Invoice:")
            print(f"Order ID: {data.get('order_id')}")
            print(f"Chat Name: {data.get('chat_name')}")
            print(f"Processing Time: {data.get('processing_timestamp')}")
            print(f"Confidence Score: {data.get('confidence_score')}")
            
            # Original message
            original_msg = data.get('original_message', {})
            print(f"Original Message: {original_msg.get('text')}")
            print(f"Sender: {original_msg.get('sender')}")
            print(f"Timestamp: {original_msg.get('timestamp')}")
            
            # Extracted invoice
            invoice = data.get('extracted_invoice', {})
            print(f"\nExtracted Invoice Details:")
            print(f"Items: {invoice.get('items', [])}")
            print(f"Total Amount: {invoice.get('total_amount')}")
            print(f"Customer Name: {invoice.get('customer_name')}")
            print(f"Delivery Address: {invoice.get('delivery_address')}")
            print(f"Special Instructions: {invoice.get('special_instructions')}")
            
            # Here you can:
            # 1. Save to database
            # 2. Send to frontend
            # 3. Generate PDF invoice
            # 4. Send email notifications
            # 5. Update analytics
            
            print(f"\n[CONSUMER] Invoice processed successfully!")
            print("-" * 60)
            
        except Exception as e:
            print(f"[CONSUMER] Error processing invoice: {e}")
    
    def check_errors(self):
        """Check for any processing errors"""
        try:
            errors = self.redis_client.lrange(self.error_queue, 0, -1)
            
            if errors:
                print(f"\n[CONSUMER] Found {len(errors)} errors:")
                for i, error_data in enumerate(errors, 1):
                    try:
                        error = json.loads(error_data)
                        print(f"Error {i}: {error.get('error')}")
                        print(f"Timestamp: {error.get('timestamp')}")
                        print("-" * 40)
                    except:
                        print(f"Error {i}: {error_data}")
                
                # Clear errors after displaying
                self.redis_client.delete(self.error_queue)
            else:
                print("[CONSUMER] No errors found")
                
        except Exception as e:
            print(f"[CONSUMER] Error checking errors: {e}")
    
    def get_queue_stats(self):
        """Get statistics about the queues"""
        try:
            output_count = self.redis_client.llen(self.output_queue)
            error_count = self.redis_client.llen(self.error_queue)
            
            print(f"\n[CONSUMER] Queue Statistics:")
            print(f"Output Queue Length: {output_count}")
            print(f"Error Queue Length: {error_count}")
            
        except Exception as e:
            print(f"[CONSUMER] Error getting stats: {e}")

if __name__ == "__main__":
    consumer = InvoiceConsumer()
    
    # You can either start the consumer or just check stats/errors
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        consumer.get_queue_stats()
        consumer.check_errors()
    else:
        consumer.start_consumer()
