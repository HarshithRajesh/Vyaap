"""
Data Models for AI Pipeline
"""
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
import uuid
import json

@dataclass
class WhatsAppMessage:
    """Structure for WhatsApp message"""
    text: str
    sender: str
    timestamp: str
    chat_name: str  # From queue name: test_neo

@dataclass
class InvoiceData:
    """Structure for extracted invoice information"""
    order_id: str
    customer_name: Optional[str] = None
    items: List[Dict[str, Any]] = None
    total_amount: Optional[float] = None
    order_date: Optional[str] = None
    delivery_address: Optional[str] = None
    contact_info: Optional[str] = None
    special_instructions: Optional[str] = None
    confidence_score: float = 0.0
    
    def __post_init__(self):
        if self.items is None:
            self.items = []
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.__dict__, default=str)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return self.__dict__

class ProcessedMessage:
    """Structure for processed message tracking"""
    message_id: str
    chat_name: str
    sender: str
    timestamp: str
    text: str
    processed_at: str
    invoice_data: Optional[InvoiceData] = None
