"""
Check Redis Queues Status
"""
import redis
import json

def check_redis_queues():
    """Check all Redis queues"""
    try:
        # Connect to Redis
        r = redis.Redis(host='localhost', port=6379, decode_responses=True)
        
        print("=== Redis Queue Status ===")
        
        # Check input queue
        test_neo_length = r.llen('test_neo')
        print(f"Input Queue (test_neo): {test_neo_length} messages")
        
        if test_neo_length > 0:
            messages = r.lrange('test_neo', 0, -1)
            print("Messages in test_neo:")
            for i, msg in enumerate(messages):
                try:
                    data = json.loads(msg)
                    print(f"  {i+1}: {data}")
                except:
                    print(f"  {i+1}: {msg}")
        
        # Check output queue
        output_length = r.llen('processed_invoices')
        print(f"Output Queue (processed_invoices): {output_length} messages")
        
        if output_length > 0:
            invoices = r.lrange('processed_invoices', 0, -1)
            print("Processed invoices:")
            for i, inv in enumerate(invoices):
                try:
                    data = json.loads(inv)
                    print(f"  {i+1}: Order ID: {data.get('order_id', 'N/A')}")
                except:
                    print(f"  {i+1}: {inv}")
        
        # Check error queue
        error_length = r.llen('processing_errors')
        print(f"Error Queue (processing_errors): {error_length} messages")
        
        if error_length > 0:
            errors = r.lrange('processing_errors', 0, -1)
            print("Errors:")
            for i, err in enumerate(errors):
                try:
                    data = json.loads(err)
                    print(f"  {i+1}: {data.get('error', 'Unknown error')}")
                except:
                    print(f"  {i+1}: {err}")
        
        # Check all keys
        all_keys = r.keys('*')
        print(f"\nAll Redis keys: {all_keys}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_redis_queues()
