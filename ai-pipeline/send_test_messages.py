"""
Send test messages to Redis for AI Pipeline processing
"""

import redis
import json
from datetime import datetime

def send_test_messages():
    """Send test messages to Redis queues"""
    try:
        # Connect to Redis
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        r.ping()
        print("Connected to Redis successfully")
        
        # Test messages in backend format
        test_data = [
            {
                "queue": "vyaap:queue:raw_chats:test_neo",
                "message": {
                    "text": "Bhaiya 2 blue dupatta pack karo",
                    "sender": "customer",
                    "timestamp": "12:00"
                }
            },
            {
                "queue": "vyaap:queue:raw_chats:fashion_store",
                "message": {
                    "text": "3 red kurti chahiye size M urgent delivery",
                    "sender": "customer1",
                    "timestamp": "14:30"
                }
            },
            {
                "queue": "vyaap:queue:raw_chats:test_neo",
                "message": {
                    "text": "Price kitna hai?",
                    "sender": "customer",
                    "timestamp": "12:01"
                }
            },
            {
                "queue": "vyaap:queue:raw_chats:fashion_store",
                "message": {
                    "text": "5 white shirts lenge 500 rs each",
                    "sender": "customer2",
                    "timestamp": "15:00"
                }
            },
            {
                "queue": "vyaap:queue:raw_chats:test_neo",
                "message": {
                    "text": "1 green saree urgent delivery needed",
                    "sender": "customer3",
                    "timestamp": "16:00"
                }
            }
        ]
        
        print(f"Sending {len(test_data)} test messages to Redis...")
        
        for i, data in enumerate(test_data, 1):
            queue_name = data["queue"]
            message = data["message"]
            
            # Push message to queue
            r.rpush(queue_name, json.dumps(message))
            
            print(f"  {i}. Sent to {queue_name}: {message['text']}")
        
        # Check queue lengths
        print("\nQueue status after sending:")
        for data in test_data:
            queue_name = data["queue"]
            length = r.llen(queue_name)
            print(f"  {queue_name}: {length} messages")
        
        print(f"\nTest messages sent successfully!")
        print(f"The AI pipeline should now process these messages.")
        
        return True
        
    except Exception as e:
        print(f"Error sending test messages: {e}")
        return False

def check_processed_invoices():
    """Check for processed invoices"""
    try:
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        
        output_length = r.llen("vyaap:queue:processed_invoices")
        print(f"\nProcessed invoices in output queue: {output_length}")
        
        if output_length > 0:
            # Get last few invoices
            recent_invoices = r.lrange("vyaap:queue:processed_invoices", -3, -1)
            
            print("Recent processed invoices:")
            for i, invoice_data in enumerate(recent_invoices, 1):
                try:
                    data = json.loads(invoice_data)
                    print(f"\nInvoice {i}:")
                    print(f"  Order ID: {data.get('order_id')}")
                    print(f"  Chat: {data.get('chat_name')}")
                    print(f"  Original: {data.get('original_message', {}).get('text')}")
                    
                    invoice = data.get('extracted_invoice', {})
                    items = invoice.get('items', [])
                    
                    if items:
                        print(f"  Items: {len(items)}")
                        for item in items:
                            qty = item.get('quantity')
                            desc = item.get('description')
                            print(f"    - {qty}x {desc}")
                    else:
                        print(f"  Items: None (non-order message)")
                    
                    print(f"  Confidence: {data.get('confidence_score')}")
                    
                except json.JSONDecodeError as e:
                    print(f"Error parsing invoice {i}: {e}")
        else:
            print("No processed invoices found yet.")
            print("Make sure the AI pipeline is running: py ai_pipeline.py")
        
    except Exception as e:
        print(f"Error checking processed invoices: {e}")

def cleanup_queues():
    """Clean up test queues"""
    try:
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        
        # Clear test queues
        test_queues = [
            "vyaap:queue:raw_chats:test_neo",
            "vyaap:queue:raw_chats:fashion_store",
            "vyaap:queue:processed_invoices"
        ]
        
        for queue in test_queues:
            r.delete(queue)
            print(f"Cleared queue: {queue}")
        
        print("Test queues cleaned up!")
        
    except Exception as e:
        print(f"Error cleaning up: {e}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        cleanup_queues()
    elif len(sys.argv) > 1 and sys.argv[1] == "check":
        check_processed_invoices()
    else:
        print("=== Send Test Messages to AI Pipeline ===")
        send_test_messages()
        print("\nTo check results:")
        print("  py send_test_messages.py check")
        print("\nTo cleanup:")
        print("  py send_test_messages.py cleanup")
