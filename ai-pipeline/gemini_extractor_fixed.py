"""
Gemini AI Extractor for Invoice Information
"""
import os
import json
import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import HumanMessage
from config import Config
from models import InvoiceData

class GeminiExtractor:
    """Extracts invoice information using Gemini AI"""
    
    def __init__(self):
        """Initialize Gemini extractor"""
        try:
            self.llm = ChatGoogleGenerativeAI(
                model=Config.GEMINI_MODEL,
                google_api_key=Config.GOOGLE_API_KEY,
                temperature=0.1  # Low temperature for consistent output
            )
            logging.info(f"Gemini extractor initialized with model: {Config.GEMINI_MODEL}")
        except Exception as e:
            logging.error(f"Failed to initialize Gemini: {e}")
            raise
    
    def extract_invoice_data(self, message_text: str, sender: str = None) -> InvoiceData:
        """Extract invoice information from WhatsApp message"""
        try:
            # Extreme prompt engineering for Hinglish invoice extraction
            prompt = self._create_extraction_prompt(message_text)
            
            # Generate response from Gemini
            response = self.llm([HumanMessage(content=prompt)])
            
            # Parse the response
            invoice_data = self._parse_response(response.content, sender)
            
            logging.info(f"Extracted invoice data: {invoice_data.order_id}")
            return invoice_data
            
        except Exception as e:
            logging.error(f"Error extracting invoice data: {e}")
            # Return basic invoice data on error
            return self._create_fallback_invoice(message_text, sender)
    
    def _create_extraction_prompt(self, message_text: str) -> str:
        """Create extreme prompt for invoice extraction"""
        return f"""
        You are an expert AI assistant specialized in extracting invoice information from Hinglish WhatsApp messages.
        
        Hinglish is a mix of Hindi and English commonly used in India for business communication.
        
        TASK: Extract invoice information from this WhatsApp message:
        "{message_text}"
        
        EXTRACTION RULES:
        1. Look for quantities (numbers with items like "2 blue dupatta", "1 red shirt")
        2. Look for product descriptions (clothing items, colors, sizes)
        3. Look for urgency indicators ("urgent", "jaldi", "fast delivery")
        4. Look for customer names if mentioned
        5. Look for delivery addresses if mentioned
        6. Look for contact information if mentioned
        7. Calculate confidence score based on clarity of information
        
        OUTPUT FORMAT (Strict JSON):
        {{
            "items": [
                {{
                    "quantity": <number>,
                    "description": "<product description>"
                }}
            ],
            "customer_name": "<customer name or null>",
            "delivery_address": "<address or null>",
            "contact_info": "<contact or null>",
            "special_instructions": "<urgent delivery, jaldi, etc. or null>",
            "confidence_score": <0.0 to 1.0>
        }}
        
        EXAMPLES:
        Input: "Bhaiya 2 blue dupatta pack karo urgent delivery"
        Output: {{"items": [{{"quantity": 2, "description": "blue dupatta", "unit_price": null, "total_price": null}}], "customer_name": null, "total_amount": null, "delivery_address": null, "contact_info": null, "special_instructions": "urgent delivery", "confidence_score": 0.8}}
        
        Input: "red shirt chahiye size M urgent"
        Output: {{"items": [{{"quantity": 1, "description": "red shirt size M", "unit_price": null, "total_price": null}}], "customer_name": null, "total_amount": null, "delivery_address": null, "contact_info": null, "special_instructions": "urgent", "confidence_score": 0.7}}
        
        Now extract from the given message and return ONLY valid JSON:
        """
    
    def _parse_response(self, response_content: str, sender: str = None) -> InvoiceData:
        """Parse Gemini response into InvoiceData"""
        try:
            # Try to parse as JSON
            if isinstance(response_content, str):
                # Extract JSON from response
                start_idx = response_content.find('{')
                end_idx = response_content.rfind('}') + 1
                
                if start_idx != -1 and end_idx > start_idx:
                    json_str = response_content[start_idx:end_idx]
                    data = json.loads(json_str)
                else:
                    data = {}
            else:
                data = response_content
            
            # Create InvoiceData object
            invoice_data = InvoiceData(
                order_id=str(uuid.uuid4()),
                customer_name=data.get('customer_name'),
                items=data.get('items', []),
                total_amount=data.get('total_amount'),
                delivery_address=data.get('delivery_address'),
                contact_info=sender,  # Use sender as contact info
                special_instructions=data.get('special_instructions'),
                confidence_score=float(data.get('confidence_score', 0.5))
            )
            
            # Set order date
            invoice_data.order_date = datetime.now().isoformat()
            
            return invoice_data
            
        except Exception as e:
            logging.error(f"Error parsing Gemini response: {e}")
            return self._create_fallback_invoice(response_content, sender)
    
    def _create_fallback_invoice(self, message_text: str, sender: str = None) -> InvoiceData:
        """Create fallback invoice data when extraction fails"""
        # Always include required fields with default values
        return InvoiceData(
            order_id=str(uuid.uuid4()),
            customer_name=None,
            items=[{
                "quantity": 1,
                "description": message_text,
                "unit_price": 0.0,
                "total_price": 0.0
            }],
            total_amount=0.0,
            delivery_address=None,
            contact_info=sender,
            special_instructions=message_text,
            confidence_score=0.1  # Low confidence for fallback
        )
    
    def test_connection(self) -> bool:
        """Test Gemini connection"""
        try:
            test_response = self.llm([HumanMessage(content="Hello")])
            logging.info("Gemini connection test successful")
            return True
        except Exception as e:
            logging.error(f"Gemini connection test failed: {e}")
            return False
