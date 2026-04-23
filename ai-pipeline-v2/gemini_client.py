import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict

from langchain.schema import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from config import Config
from models import InvoiceData


class GeminiClient:
    def __init__(self) -> None:
        self.llm = ChatGoogleGenerativeAI(
            model=Config.GEMINI_MODEL,
            google_api_key=Config.GOOGLE_API_KEY,
            temperature=0.1,
        )

    def test_connection(self) -> bool:
        try:
            self.llm([HumanMessage(content="hello")])
            return True
        except Exception as exc:
            logging.error("Gemini connection failed: %s", exc)
            return False

    def extract_invoice(self, combined_chat_text: str, default_contact: str) -> InvoiceData:
        prompt = self._prompt(combined_chat_text)
        try:
            response = self.llm([HumanMessage(content=prompt)])
            parsed = self._parse_json(response.content)
            return self._to_invoice(parsed, default_contact)
        except Exception as exc:
            logging.error("Gemini extraction failed: %s", exc)
            return self._fallback_invoice(combined_chat_text, default_contact)

    def _prompt(self, combined_chat_text: str) -> str:
        return f"""
You are Chat2Cash invoice extraction engine for Indian SMB WhatsApp chats.
Input can be messy Hinglish, mixed intent, and non-order conversation.
Extract ONE structured output for the full chat batch.
Return only valid JSON and nothing else.

Chat batch:
{combined_chat_text}

JSON schema:
{{
  "order_intent": "confirmed|inquiry|unclear",
  "order_confidence_reason": "short reason",
  "customer_name": "string|null",
  "items": [{{"quantity": number, "description": "string"}}],
  "total_amount": number|null,
  "subtotal_amount": number|null,
  "cgst_amount": number|null,
  "sgst_amount": number|null,
  "gst_rate_percent": number|null,
  "amount_due": number|null,
  "payment_status": "pending|paid|partially_paid",
  "payment_link": "string|null",
  "delivery_address": "string|null",
  "contact_info": "string|null",
  "special_instructions": "string|null",
  "confidence_score": number
}}

Rules:
1) Distinguish inquiry vs confirmed order. Use:
   - confirmed: clear buy intent, quantity, and actionable request.
   - inquiry: asking price/availability only, no final confirmation.
   - unclear: ambiguous/noisy and not enough signal.
2) Do NOT treat polite words like "bhaiya", "sir", "madam" as customer names.
3) Keep unknown fields null.
4) If tax fields are not present, keep them null.
5) Ensure items is always an array. For confirmed with no clear line item, create one best-effort item.
"""

    def _parse_json(self, content: Any) -> Dict[str, Any]:
        if not isinstance(content, str):
            return {}
        start = content.find("{")
        end = content.rfind("}") + 1
        if start == -1 or end <= start:
            return {}
        return json.loads(content[start:end])

    def _to_invoice(self, data: Dict[str, Any], default_contact: str) -> InvoiceData:
        intent = self._norm_intent(data.get("order_intent"))
        total_amount = self._to_float(data.get("total_amount"))
        subtotal_amount = self._to_float(data.get("subtotal_amount"))
        cgst_amount = self._to_float(data.get("cgst_amount"))
        sgst_amount = self._to_float(data.get("sgst_amount"))
        gst_rate_percent = self._to_float(data.get("gst_rate_percent"))
        amount_due = self._to_float(data.get("amount_due"))
        confidence = self._bounded_float(data.get("confidence_score"), default=0.5, lo=0.0, hi=1.0)
        payment_status = self._norm_payment_status(data.get("payment_status"))

        return InvoiceData(
            order_id=str(uuid.uuid4()),
            order_intent=intent,
            order_confidence_reason=self._to_str(data.get("order_confidence_reason")),
            customer_name=data.get("customer_name"),
            items=self._sanitize_items(data.get("items")),
            total_amount=total_amount,
            subtotal_amount=subtotal_amount,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            gst_rate_percent=gst_rate_percent,
            amount_due=amount_due if amount_due is not None else total_amount,
            payment_status=payment_status,
            payment_link=self._to_str(data.get("payment_link")),
            order_date=datetime.now().isoformat(),
            delivery_address=self._to_str(data.get("delivery_address")),
            contact_info=self._to_str(data.get("contact_info")) or default_contact,
            special_instructions=self._to_str(data.get("special_instructions")),
            confidence_score=confidence,
        )

    def _fallback_invoice(self, text: str, default_contact: str) -> InvoiceData:
        return InvoiceData(
            order_id=str(uuid.uuid4()),
            order_intent="unclear",
            order_confidence_reason="fallback_extraction",
            customer_name=None,
            items=[{"quantity": 1, "description": text[:2000]}],
            total_amount=None,
            subtotal_amount=None,
            cgst_amount=None,
            sgst_amount=None,
            gst_rate_percent=None,
            amount_due=None,
            payment_status="pending",
            payment_link=None,
            order_date=datetime.now().isoformat(),
            delivery_address=None,
            contact_info=default_contact,
            special_instructions="fallback_extraction",
            confidence_score=0.1,
        )

    @staticmethod
    def _sanitize_items(items: Any) -> list:
        if not isinstance(items, list):
            return []
        cleaned = []
        for item in items:
            if not isinstance(item, dict):
                continue
            quantity = item.get("quantity")
            try:
                quantity = float(quantity)
                if quantity.is_integer():
                    quantity = int(quantity)
            except Exception:
                quantity = 1
            description = str(item.get("description", "")).strip()
            if not description:
                continue
            cleaned.append({"quantity": quantity, "description": description})
        return cleaned

    @staticmethod
    def _to_float(value: Any) -> Any:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except Exception:
            return None

    @staticmethod
    def _bounded_float(value: Any, default: float, lo: float, hi: float) -> float:
        try:
            num = float(value)
            return max(lo, min(hi, num))
        except Exception:
            return default

    @staticmethod
    def _to_str(value: Any) -> Any:
        if value is None:
            return None
        s = str(value).strip()
        return s if s else None

    @staticmethod
    def _norm_intent(value: Any) -> str:
        v = str(value or "").strip().lower()
        if v in {"confirmed", "inquiry", "unclear"}:
            return v
        return "unclear"

    @staticmethod
    def _norm_payment_status(value: Any) -> str:
        v = str(value or "").strip().lower()
        if v in {"pending", "paid", "partially_paid"}:
            return v
        return "pending"
