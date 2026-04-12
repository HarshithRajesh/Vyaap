"""
Test AI Pipeline without Redis
Simulates the Redis flow for testing
"""

import json
from ai_pipeline import AIPipeline, WhatsAppMessage

def simulate_redis_flow():
    """Simulate the complete Redis flow without Redis server"""
    print("=== Testing AI Pipeline (Simulated Redis Flow) ===")
    
    # Create pipeline
    pipeline = AIPipeline()
    
    # Simulate incoming message from Redis
    test_data = {
        "chatName": "test_neo",
        "messages": [
            {
                "text": "Bhaiya 2 blue dupatta pack karo",
                "sender": "customer",
                "timestamp": "12:00"
            }
        ]
    }
    
    print(f"[SIMULATION] Incoming message from Redis:")
    print(f"Queue: vyaap:queue:raw_chats:test_neo")
    print(f"Data: {json.dumps(test_data, indent=2)}")
    print("-" * 50)
    
    # Process the message (this is what the pipeline does)
    raw_data = json.dumps(test_data)
    
    # Since we don't have Redis, we'll call process_message directly
    print("[AI_PIPELINE] Processing message...")
    
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
        
        print(f"\n[AI_PIPELINE] Processing:")
        print(f"Chat: {chat_name}")
        print(f"Message: {message.text}")
        print(f"Sender: {message.sender}")
        print(f"Timestamp: {message.timestamp}")
        
        # Generate user ID
        user_id = pipeline.vector_store.generate_user_id(chat_name, message.sender)
        print(f"User ID: {user_id}")
        
        # Add to vector store
        pipeline.vector_store.add_user_message(user_id, message)
        
        # Extract invoice information
        invoice = pipeline.invoice_extractor.extract_invoice_info(message)
        
        # Store invoice
        if user_id in pipeline.vector_store.user_data:
            pipeline.vector_store.user_data[user_id]['invoices'].append(invoice)
        
        print(f"\n[AI_PIPELINE] Extracted Invoice:")
        print(f"Order ID: {invoice.order_id}")
        print(f"Items: {invoice.items}")
        print(f"Total Amount: {invoice.total_amount}")
        print(f"Customer Name: {invoice.customer_name}")
        print(f"Confidence Score: {invoice.confidence_score:.2f}")
        
        # Simulate publishing back to Redis
        output_data = {
            "order_id": invoice.order_id,
            "chat_name": message.chat_name,
            "original_message": {
                "text": message.text,
                "sender": message.sender,
                "timestamp": message.timestamp
            },
            "extracted_invoice": invoice.dict(),
            "processing_timestamp": "2024-04-12T15:30:00",
            "confidence_score": invoice.confidence_score
        }
        
        print(f"\n[AI_PIPELINE] Publishing to Redis:")
        print(f"Queue: vyaap:queue:processed_invoices")
        print(f"Data: {json.dumps(output_data, indent=2)}")
        print("-" * 50)
        
        print("SUCCESS: Complete flow tested without Redis!")
        
        return output_data

def test_multiple_messages():
    """Test multiple messages"""
    print("\n=== Testing Multiple Messages ===")
    
    test_messages = [
        {
            "chatName": "test_neo",
            "messages": [
                {"text": "Bhaiya 2 blue dupatta pack karo", "sender": "customer", "timestamp": "12:00"},
                {"text": "Price kitna hai?", "sender": "customer", "timestamp": "12:01"},
                {"text": "500 rs me milega", "sender": "business", "timestamp": "12:02"},
                {"text": "Thik hai, pack kar do", "sender": "customer", "timestamp": "12:03"}
            ]
        },
        {
            "chatName": "fashion_store",
            "messages": [
                {"text": "3 red kurti chahiye size M", "sender": "customer1", "timestamp": "14:30"},
                {"text": "Delivery address: 123 Main Street, Delhi", "sender": "customer1", "timestamp": "14:31"},
                {"text": "Total 1200 rs", "sender": "business", "timestamp": "14:32"},
                {"text": "Confirm kar diya", "sender": "customer1", "timestamp": "14:33"}
            ]
        }
    ]
    
    pipeline = AIPipeline()
    
    for i, test_data in enumerate(test_messages, 1):
        print(f"\n--- Processing Message Set {i} ---")
        
        raw_data = json.dumps(test_data)
        data = json.loads(raw_data)
        chat_name = data.get('chatName', 'unknown')
        messages = data.get('messages', [])
        
        for msg_data in messages:
            message = WhatsAppMessage(
                text=msg_data.get('text', ''),
                sender=msg_data.get('sender', 'unknown'),
                timestamp=msg_data.get('timestamp', ''),
                chat_name=chat_name
            )
            
            # Process message
            user_id = pipeline.vector_store.generate_user_id(chat_name, message.sender)
            pipeline.vector_store.add_user_message(user_id, message)
            invoice = pipeline.invoice_extractor.extract_invoice_info(message)
            
            if user_id in pipeline.vector_store.user_data:
                pipeline.vector_store.user_data[user_id]['invoices'].append(invoice)
            
            print(f"Processed: {message.text[:30]}... -> Invoice: {invoice.order_id}")
    
    # Generate revenue report
    print(f"\n--- Revenue Report ---")
    report = pipeline.generate_revenue_report("test_neo", days=7)
    print(f"Test Neo Revenue: {report}")
    
    report = pipeline.generate_revenue_report("fashion_store", days=7)
    print(f"Fashion Store Revenue: {report}")

if __name__ == "__main__":
    # Test single message
    simulate_redis_flow()
    
    # Test multiple messages
    test_multiple_messages()
    
    print("\n" + "=" * 60)
    print("AI Pipeline testing completed successfully!")
    print("Ready for integration with Redis when Redis server is available.")
