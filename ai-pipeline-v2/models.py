from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional
import json


@dataclass
class ChatMessage:
    text: str
    sender: str
    timestamp: str


@dataclass
class QueueBatch:
    user_id: str
    chat_name: str
    messages: List[ChatMessage]
    queued_at: str
    queue_key: str


@dataclass
class InvoiceData:
    order_id: str
    order_intent: str
    order_confidence_reason: Optional[str]
    customer_name: Optional[str]
    items: List[Dict[str, Any]]
    total_amount: Optional[float]
    subtotal_amount: Optional[float]
    cgst_amount: Optional[float]
    sgst_amount: Optional[float]
    gst_rate_percent: Optional[float]
    amount_due: Optional[float]
    payment_status: str
    payment_link: Optional[str]
    order_date: Optional[str]
    delivery_address: Optional[str]
    contact_info: Optional[str]
    special_instructions: Optional[str]
    confidence_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)
