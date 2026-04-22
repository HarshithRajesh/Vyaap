"""
Test Message Sender for AI Pipeline
"""
import redis
import json
import time
from datetime import datetime

def send_test_message(redis_host='localhost', redis_port=6379, queue_name='test_neo'):
    """Send test message to Redis queue"""
    try:
        # Connect to Redis
        r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        
        # Test message matching your curl example
        test_payload = {
            "chatName": "test_neo",
            "messages": [
                {
                    "text": "Bhaiya 2 blue dupatta pack karo", 
                    "sender": "customer", 
                    "timestamp": "12:00"
                }
            ]
        }
        
        # Send to Redis queue
        r.lpush(queue_name, json.dumps(test_payload))
        
        print(f"✅ Test message sent to Redis queue: {queue_name}")
        print(f"📝 Message: {test_payload['messages'][0]['text']}")
        print(f"👤 Sender: {test_payload['messages'][0]['sender']}")
        print(f"⏰ Timestamp: {test_payload['messages'][0]['timestamp']}")
        
        # Check queue length
        queue_length = r.llen(queue_name)
        print(f"📊 Queue length: {queue_length}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error sending test message: {e}")
        return False

def check_queue_status(redis_host='localhost', redis_port=6379, queue_name='test_neo'):
    """Check Redis queue status"""
    try:
        r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        
        print(f"📊 Queue Status for: {queue_name}")
        print(f"📏 Length: {r.llen(queue_name)}")
        
        # Get last message without removing
        last_message = r.lindex(queue_name, -1)
        if last_message:
            data = json.loads(last_message)
            print(f"📝 Last message: {data}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error checking queue: {e}")
        return False

def clear_queue(redis_host='localhost', redis_port=6379, queue_name='test_neo'):
    """Clear Redis queue"""
    try:
        r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        
        length = r.llen(queue_name)
        r.delete(queue_name)
        
        print(f"🗑️ Cleared queue: {queue_name} (removed {length} messages)")
        return True
        
    except Exception as e:
        print(f"❌ Error clearing queue: {e}")
        return False

def main():
    """Main function for testing"""
    print("🧪 AI Pipeline Test Tool")
    print("=" * 40)
    
    while True:
        print("\nOptions:")
        print("1. Send test message")
        print("2. Check queue status")
        print("3. Clear queue")
        print("4. Exit")
        
        choice = input("\nEnter choice (1-4): ").strip()
        
        if choice == "1":
            send_test_message()
        elif choice == "2":
            check_queue_status()
        elif choice == "3":
            clear_queue()
        elif choice == "4":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice")

if __name__ == "__main__":
    main()
