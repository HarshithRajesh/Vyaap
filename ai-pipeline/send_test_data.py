"""
Send test data to Redis for AI Pipeline processing
"""

import redis
import json

def send_test_message():
    """Send test WhatsApp message to Redis queue"""
    try:
        # Connect to Redis
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        
        # Test message data
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
        
        # Send to Redis queue
        r.rpush("vyaap:queue:raw_chats:test_neo", json.dumps(test_data))
        
        print("Test message sent to Redis successfully!")
        print(f"Queue length: {r.llen('vyaap:queue:raw_chats:test_neo')}")
        
    except Exception as e:
        print(f"Error sending message: {e}")

if __name__ == "__main__":
    send_test_message()
