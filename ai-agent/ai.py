import redis
import json

def start_worker():
    try:
        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        print("✅ Python Worker connected to Redis. Waiting for messages...")
    except Exception as e:
        print(f"❌ Redis Connection Error: {e}")
        return

    while True:
        task = r.blpop("vyaap:queue:raw_chats:test_neo", timeout=0)
        
        if task:
            raw_data = task[1]
            
            try:
                message = json.loads(raw_data)
                
                print("\n--- NEW MESSAGE FROM REDIS ---")
                print(f"Sender:    {message.get('sender')}")
                print(f"Text:      {message.get('text')}")
                print(f"Timestamp: {message.get('timestamp')}")
                print("------------------------------")
                
            except json.JSONDecodeError:
                print(f"❌ Failed to decode JSON: {raw_data}")

if __name__ == "__main__":
    start_worker()
