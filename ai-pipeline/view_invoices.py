"""
View all processed invoices in readable format
"""
import redis
import json

def view_invoices():
    """View all processed invoices"""
    try:
        r = redis.Redis(host='localhost', port=6379, decode_responses=True)
        invoices = r.lrange('processed_invoices', 0, -1)
        
        print('=== ALL PROCESSED INVOICES ===')
        for i, invoice in enumerate(invoices, 1):
            data = json.loads(invoice)
            print(f'\n--- Invoice {i} ---')
            print(f'Order ID: {data["order_id"]}')
            print(f'Customer: {data.get("customer_name", "N/A")}')
            print(f'Items: {data.get("items", [])}')
            print(f'Confidence: {data["confidence_score"]}')
            print(f'Contact: {data.get("contact_info", "N/A")}')
        
        print(f'\nTotal invoices processed: {len(invoices)}')
        
        print(f'\nTotal invoices processed: {len(invoices)}')
        
    except Exception as e:
        print(f'Error: {e}')

if __name__ == "__main__":
    view_invoices()
