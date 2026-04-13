"""
Advanced Invoice Extractor using LangChain
Enhanced with few-shot prompting, chain of thought, and structured output
"""

import os
import json
import re
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from langchain.chat_models import ChatOpenAI
from langchain.prompts import FewShotPromptTemplate, PromptTemplate
from langchain.chains import LLMChain
from langchain.output_parsers import PydanticOutputParser
from langchain.schema import HumanMessage, SystemMessage
from ai_pipeline import WhatsAppMessage, InvoiceData
from config import Config, MODEL_OPTIONS

class ExtractedItem(BaseModel):
    """Structured item extraction"""
    quantity: int = Field(description="Quantity of items")
    description: str = Field(description="Clean product description")
    unit_price: Optional[float] = Field(description="Price per unit", default=None)
    total_price: Optional[float] = Field(description="Total price for this item", default=None)
    
    @validator('quantity')
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v

class ExtractedInvoice(BaseModel):
    """Structured invoice extraction"""
    is_order: bool = Field(description="Whether this message contains an order")
    order_id: str = Field(description="Unique order identifier")
    items: List[ExtractedItem] = Field(description="List of ordered items")
    total_amount: Optional[float] = Field(description="Total order amount", default=None)
    customer_name: Optional[str] = Field(description="Customer name if mentioned", default=None)
    delivery_address: Optional[str] = Field(description="Delivery address if mentioned", default=None)
    special_instructions: Optional[str] = Field(description="Special instructions like urgent delivery", default=None)
    confidence_score: float = Field(description="Confidence in extraction accuracy (0-1)")
    reasoning: str = Field(description="Step-by-step reasoning for extraction")

class AdvancedInvoiceExtractor:
    """Advanced invoice extraction using LangChain"""
    
    def __init__(self, api_key: str = None, model_name: str = None):
        self.api_key = api_key or Config.OPENAI_API_KEY
        self.model_name = model_name or Config.OPENAI_MODEL
        
        if not self.api_key:
            print("Warning: No OpenAI API key found. Using fallback extraction.")
            self.use_llm = False
        else:
            print(f"Using OpenAI model: {self.model_name}")
            
            # Check if model is supported
            if self.model_name in MODEL_OPTIONS:
                model_info = MODEL_OPTIONS[self.model_name]
                print(f"Model info: {model_info['description']}")
                print(f"Max tokens: {model_info['max_tokens']}")
                print(f"Cost per 1k tokens: ${model_info['cost_per_1k_tokens']}")
            
            self.llm = ChatOpenAI(
                model_name=self.model_name,
                temperature=Config.MODEL_TEMPERATURE,
                openai_api_key=self.api_key,
                openai_api_base=Config.OPENAI_BASE_URL,
                model_kwargs=Config.get_openai_model_kwargs()
            )
            self.use_llm = True
            self.setup_prompts()
    
    def setup_prompts(self):
        """Setup LangChain prompts with few-shot examples"""
        
        # Few-shot examples for better understanding
        examples = [
            {
                "message": "Bhaiya 2 blue dupatta pack karo",
                "reasoning": "1. Identify quantity: '2' -> quantity=2. 2. Identify product: 'blue dupatta' -> description='blue dupatta'. 3. No price mentioned -> unit_price=None. 4. This is an order because it asks to 'pack karo'.",
                "output": {
                    "is_order": True,
                    "order_id": "ORD123",
                    "items": [{"quantity": 2, "description": "blue dupatta", "unit_price": None, "total_price": None}],
                    "total_amount": None,
                    "customer_name": None,
                    "delivery_address": None,
                    "special_instructions": None,
                    "confidence_score": 0.9,
                    "reasoning": "Clear order with quantity and product"
                }
            },
            {
                "message": "Price kitna hai?",
                "reasoning": "1. No quantity mentioned. 2. No product to order. 3. This is a price inquiry, not an order. 4. Keywords: 'price', 'kitna' indicate inquiry.",
                "output": {
                    "is_order": False,
                    "order_id": "INQ123",
                    "items": [],
                    "total_amount": None,
                    "customer_name": None,
                    "delivery_address": None,
                    "special_instructions": None,
                    "confidence_score": 0.95,
                    "reasoning": "Price inquiry, not an order"
                }
            },
            {
                "message": "3 red kurti chahiye size M urgent delivery",
                "reasoning": "1. Quantity: '3' -> quantity=3. 2. Product: 'red kurti' -> description='red kurti'. 3. Size: 'M' can be included in description. 4. Special: 'urgent delivery' -> special_instructions. 5. Keywords: 'chahiye' indicate order.",
                "output": {
                    "is_order": True,
                    "order_id": "ORD124",
                    "items": [{"quantity": 3, "description": "red kurti size M", "unit_price": None, "total_price": None}],
                    "total_amount": None,
                    "customer_name": None,
                    "delivery_address": None,
                    "special_instructions": "urgent delivery",
                    "confidence_score": 0.85,
                    "reasoning": "Order with quantity, product, and special instructions"
                }
            },
            {
                "message": "Delivery address: 123 Main Street, Delhi. Total 1200 rs",
                "reasoning": "1. No new order items mentioned. 2. Contains delivery address info. 3. Contains total price but no new order. 4. This is additional info, not a new order.",
                "output": {
                    "is_order": False,
                    "order_id": "INFO123",
                    "items": [],
                    "total_amount": 1200.0,
                    "customer_name": None,
                    "delivery_address": "123 Main Street, Delhi",
                    "special_instructions": None,
                    "confidence_score": 0.8,
                    "reasoning": "Additional information, not a new order"
                }
            }
        ]
        
        # Example formatter
        example_prompt = PromptTemplate(
            input_variables=["message", "reasoning", "output"],
            template="""
Message: {message}
Reasoning: {reasoning}
Output: {output}
"""
        )
        
        # Few-shot prompt template
        self.few_shot_prompt = FewShotPromptTemplate(
            examples=examples,
            example_prompt=example_prompt,
            prefix="""You are an expert at extracting invoice information from WhatsApp messages in Hinglish (mix of Hindi and English).

Your task is to analyze the message and extract structured invoice information. Follow this reasoning process:

1. Identify if this is an order or inquiry
2. Extract quantities and products
3. Identify special instructions
4. Extract prices if mentioned
5. Determine confidence level

Key indicators:
- Order indicators: "chahiye", "lenge", "pack karo", "dena", "mang", "order", "booking"
- Inquiry indicators: "price", "kitna", "how much", "cost", "charges"
- Special instructions: "urgent", "jaldi", "fast", "delivery", "address"

Examples:
""",
            suffix="""
Now analyze this message:
Message: {message}
Reasoning: {reasoning}
Output: """,
            input_variables=["message", "reasoning"]
        )
        
        # Output parser
        self.output_parser = PydanticOutputParser(pydantic_object=ExtractedInvoice)
        
        # Chain of thought prompt
        self.chain_of_thought_prompt = PromptTemplate(
            input_variables=["message", "format_instructions"],
            template="""Analyze this WhatsApp message step by step:

Message: {message}

Step 1: Is this an order or inquiry?
- Look for order keywords vs inquiry keywords
- Consider context and intent

Step 2: Extract items if order
- Find quantities (numbers)
- Find product descriptions
- Clean up filler words

Step 3: Extract additional information
- Prices if mentioned
- Delivery address if mentioned
- Special instructions if mentioned

Step 4: Assess confidence
- How clear is the order intent?
- How complete is the information?

{format_instructions}

Provide your analysis:"""
        )
    
    def extract_with_llm(self, message: WhatsAppMessage) -> InvoiceData:
        """Extract using LangChain with advanced prompting"""
        try:
            # Generate reasoning
            reasoning = self.generate_reasoning(message.text)
            
            # Create chain
            chain = LLMChain(
                llm=self.llm,
                prompt=self.chain_of_thought_prompt
            )
            
            # Run extraction
            result = chain.run(
                message=message.text,
                format_instructions=self.output_parser.get_format_instructions()
            )
            
            # Parse output
            extracted = self.output_parser.parse(result)
            
            # Convert to InvoiceData
            if extracted.is_order and extracted.items:
                return InvoiceData(
                    order_id=extracted.order_id,
                    customer_name=extracted.customer_name,
                    items=[
                        {
                            "quantity": item.quantity,
                            "description": item.description,
                            "unit_price": item.unit_price,
                            "total_price": item.total_price
                        }
                        for item in extracted.items
                    ],
                    total_amount=extracted.total_amount,
                    order_date=datetime.now().strftime('%Y-%m-%d'),
                    delivery_address=extracted.delivery_address,
                    contact_info=None,
                    special_instructions=extracted.special_instructions,
                    confidence_score=extracted.confidence_score
                )
            else:
                # Return empty invoice for non-orders
                return InvoiceData(
                    order_id=extracted.order_id,
                    order_date=datetime.now().strftime('%Y-%m-%d'),
                    confidence_score=0.0
                )
                
        except Exception as e:
            print(f"LLM extraction failed: {e}")
            return self.fallback_extraction(message)
    
    def generate_reasoning(self, text: str) -> str:
        """Generate chain-of-thought reasoning"""
        reasoning_prompt = PromptTemplate(
            input_variables=["text"],
            template="""Analyze this message and provide step-by-step reasoning:

Message: {text}

Provide reasoning in this format:
Step 1: [Analysis of order vs inquiry]
Step 2: [Item extraction analysis]
Step 3: [Additional info extraction]
Step 4: [Confidence assessment]

Reasoning:"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=reasoning_prompt)
        return chain.run(text=text)
    
    def fallback_extraction(self, message: WhatsAppMessage) -> InvoiceData:
        """Fallback extraction without LLM"""
        # Use existing rule-based extraction as fallback
        from ai_pipeline import AIInvoiceExtractor
        fallback_extractor = AIInvoiceExtractor()
        return fallback_extractor.extract_invoice_info(message)
    
    def extract_invoice_info(self, message: WhatsAppMessage) -> InvoiceData:
        """Main extraction method"""
        if self.use_llm:
            return self.extract_with_llm(message)
        else:
            return self.fallback_extraction(message)
    
    def is_order_message(self, text: str, numbers: List[int], prices: List[float]) -> bool:
        """Enhanced order detection using LLM"""
        if not self.use_llm:
            # Fallback to rule-based detection
            order_keywords = [
                'chahiye', 'chahi', 'lenge', 'le', 'dena', 'pack', 'pack karo',
                'order', 'booking', 'reserve', 'book', 'book karo', 'order karo',
                'mang', 'mangna', 'mang rahe', 'mungi', 'mungiye'
            ]
            
            non_order_keywords = [
                'price', 'kitna', 'how much', 'cost', 'rate', 'charges',
                'thank', 'thanks', 'dhanyawad', 'shukriya',
                'ok', 'okay', 'thik', 'theek', 'confirm', 'confirm kar diya',
                'hi', 'hello', 'bye', 'good morning', 'good evening'
            ]
            
            text_lower = text.lower()
            has_order_keyword = any(keyword in text_lower for keyword in order_keywords)
            has_non_order_keyword = any(keyword in text_lower for keyword in non_order_keywords)
            has_quantity = len(numbers) > 0
            has_price = len(prices) > 0
            
            if has_order_keyword:
                return True
            
            if has_quantity and not (has_price and not has_order_keyword):
                return True
            
            return False
        else:
            # Use LLM for order detection
            try:
                order_prompt = PromptTemplate(
                    input_variables=["text"],
                    template="""Is this message an order or just an inquiry?

Message: {text}

Respond with only "ORDER" or "INQUIRY" based on the intent."""
                )
                
                chain = LLMChain(llm=self.llm, prompt=order_prompt)
                result = chain.run(text=text).strip().upper()
                return result == "ORDER"
                
            except:
                # Fallback to rule-based
                return self.is_order_message(text, numbers, prices)
