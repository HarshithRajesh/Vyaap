"""
Test Suite for AI Pipeline
Tests the WhatsApp message processing and invoice extraction
"""

import json
import time
from ai_pipeline import AIPipeline, WhatsAppMessage, InvoiceData

def create_test_messages():
    """Create test WhatsApp messages in Hinglish"""
    return [
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
        },
        {
            "chatName": "test_neo",
            "messages": [
                {"text": "Bhaiya 2 blue dupatta pack karo", "sender": "customer", "timestamp": "15:00"},  # Duplicate
                {"text": "1 green saree chahiye urgent", "sender": "customer2", "timestamp": "15:30"},
                {"text": "Jaldi karna, party me Lena hai", "sender": "customer2", "timestamp": "15:31"}
            ]
        }
    ]

def test_text_processing():
    """Test Hinglish text processing"""
    from ai_pipeline import HinglishTextProcessor
    
    processor = HinglishTextProcessor()
    
    test_cases = [
        "Bhaiya 2 blue dupatta pack karo",
        "3 red kurti chahiye size M",
        "Price 500 rs hai",
        "Delivery address: 123 Main Street"
    ]
    
    print("=== Testing Text Processing ===")
    for text in test_cases:
        normalized = processor.normalize_text(text)
        numbers = processor.extract_numbers(text)
        prices = processor.extract_prices(text)
        
        print(f"Original: {text}")
        print(f"Normalized: {normalized}")
        print(f"Numbers: {numbers}")
        print(f"Prices: {prices}")
        print("-" * 40)

def test_invoice_extraction():
    """Test invoice extraction from messages"""
    from ai_pipeline import AIInvoiceExtractor
    
    extractor = AIInvoiceExtractor()
    
    test_messages = [
        WhatsAppMessage(
            text="Bhaiya 2 blue dupatta pack karo",
            sender="customer",
            timestamp="12:00",
            chat_name="test_neo"
        ),
        WhatsAppMessage(
            text="3 red kurti chahiye size M, price 1200 rs",
            sender="customer1",
            timestamp="14:30",
            chat_name="fashion_store"
        ),
        WhatsAppMessage(
            text="1 green saree urgent delivery, address 123 Main Street",
            sender="customer2",
            timestamp="15:30",
            chat_name="test_neo"
        )
    ]
    
    print("=== Testing Invoice Extraction ===")
    for message in test_messages:
        invoice = extractor.extract_invoice_info(message)
        
        print(f"Message: {message.text}")
        print(f"Order ID: {invoice.order_id}")
        print(f"Items: {invoice.items}")
        print(f"Total Amount: {invoice.total_amount}")
        print(f"Customer Name: {invoice.customer_name}")
        print(f"Instructions: {invoice.special_instructions}")
        print(f"Confidence: {invoice.confidence_score:.2f}")
        print("-" * 40)

def test_vector_store():
    """Test vector database functionality"""
    from ai_pipeline import UserVectorStore
    
    store = UserVectorStore()
    
    # Add test messages
    messages = [
        WhatsAppMessage("Bhaiya 2 blue dupatta pack karo", "customer", "12:00", "test_neo"),
        WhatsAppMessage("3 red kurti chahiye", "customer1", "14:30", "fashion_store"),
        WhatsAppMessage("Bhaiya 2 blue dupatta pack karo", "customer", "15:00", "test_neo"),  # Duplicate
    ]
    
    print("=== Testing Vector Store ===")
    
    for i, message in enumerate(messages):
        user_id = store.generate_user_id(message.chat_name, message.sender)
        
        # Check for duplicates
        is_duplicate = store.check_duplicate(message)
        print(f"Message {i+1}: {message.text[:30]}...")
        print(f"User ID: {user_id}")
        print(f"Is Duplicate: {is_duplicate}")
        
        if not is_duplicate:
            store.add_user_message(user_id, message)
            print("Added to vector store")
        else:
            print("Skipped (duplicate)")
        print("-" * 40)
    
    # Test user retrieval
    print("User Data Summary:")
    for user_id, user_data in store.user_data.items():
        print(f"User: {user_id}")
        print(f"Chat: {user_data['chat_name']}")
        print(f"Messages: {len(user_data['messages'])}")
        print(f"Invoices: {len(user_data['invoices'])}")
        print("-" * 40)

def test_full_pipeline():
    """Test the complete AI pipeline"""
    print("=== Testing Full Pipeline ===")
    
    # Create pipeline (without Redis for testing)
    pipeline = AIPipeline()
    
    # Process test messages
    test_data = create_test_messages()
    
    for chat_data in test_data:
        print(f"\nProcessing chat: {chat_data['chatName']}")
        print("-" * 40)
        
        raw_data = json.dumps(chat_data)
        pipeline.process_message(raw_data)
    
    # Test invoice retrieval
    print("\n=== Testing Invoice Retrieval ===")
    invoices = pipeline.get_user_invoices("test_neo", hours=24)
    print(f"Found {len(invoices)} invoices for test_neo")
    
    for invoice in invoices:
        print(f"Order ID: {invoice.order_id}")
        print(f"Items: {invoice.items}")
        print(f"Total: {invoice.total_amount}")
        print("-" * 20)
    
    # Test revenue report
    print("\n=== Testing Revenue Report ===")
    report = pipeline.generate_revenue_report("test_neo", days=7)
    print(f"Revenue Report for test_neo:")
    print(f"Total Revenue: {report.get('total_revenue', 0)}")
    print(f"Total Orders: {report.get('total_orders', 0)}")
    print(f"Average Order Value: {report.get('average_order_value', 0)}")

def test_redis_publishing():
    """Test Redis publishing functionality"""
    print("=== Testing Redis Publishing ===")
    
    try:
        # Create pipeline
        pipeline = AIPipeline()
        
        # Create test message
        message = WhatsAppMessage(
            text="Bhaiya 2 blue dupatta pack karo",
            sender="customer",
            timestamp="12:00",
            chat_name="test_redis"
        )
        
        # Extract invoice
        invoice = pipeline.invoice_extractor.extract_invoice_info(message)
        
        # Test publishing
        print("Testing invoice publishing...")
        pipeline.publish_invoice(invoice, message)
        
        # Check if published to Redis
        output_count = pipeline.redis_client.llen(pipeline.output_queue)
        print(f"Messages in output queue: {output_count}")
        
        if output_count > 0:
            # Get the published message
            published_data = pipeline.redis_client.lrange(pipeline.output_queue, 0, 0)[0]
            data = json.loads(published_data)
            
            print(f"Published Order ID: {data.get('order_id')}")
            print(f"Chat Name: {data.get('chat_name')}")
            print(f"Confidence Score: {data.get('confidence_score')}")
            print("Redis publishing test: PASSED")
        else:
            print("Redis publishing test: FAILED - No messages in queue")
            
    except Exception as e:
        print(f"Redis publishing test failed: {e}")

def test_api_endpoints():
    """Test API endpoints (requires server running)"""
    print("=== Testing API Endpoints ===")
    print("To test API endpoints:")
    print("1. Run: python api_server.py")
    print("2. Then test with curl or Postman:")
    print("")
    print("# Health check:")
    print("curl http://localhost:8000/health")
    print("")
    print("# Ingest messages:")
    print('curl -X POST http://localhost:8000/ingest -H "Content-Type: application/json" -d \'{"chatName": "test", "messages": [{"text": "2 blue dupatta pack karo", "sender": "customer", "timestamp": "12:00"}]}\'')
    print("")
    print("# Get invoices:")
    print('curl -X POST http://localhost:8000/invoices -H "Content-Type: application/json" -d \'{"chat_name": "test", "hours": 24}\'')
    print("")
    print("# Get revenue report:")
    print('curl -X POST http://localhost:8000/revenue -H "Content-Type: application/json" -d \'{"chat_name": "test", "days": 7}\'')
    print("")
    print("# Test Redis publishing:")
    print("1. Run: python ai_pipeline.py (in one terminal)")
    print("2. Run: python redis_consumer.py (in another terminal)")
    print("3. Send test message to see end-to-end flow")

def main():
    """Run all tests"""
    print("AI Pipeline Test Suite")
    print("=" * 50)
    
    try:
        # Test individual components
        test_text_processing()
        print("\n")
        
        test_invoice_extraction()
        print("\n")
        
        test_vector_store()
        print("\n")
        
        test_full_pipeline()
        print("\n")
        
        test_redis_publishing()
        print("\n")
        
        test_api_endpoints()
        
        print("\n" + "=" * 50)
        print("All tests completed successfully!")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
