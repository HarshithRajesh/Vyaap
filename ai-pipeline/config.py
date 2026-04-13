"""
Configuration for AI Pipeline
Easily manage OpenAI model settings and other configurations
"""

import os
from typing import Dict, Any

class Config:
    """Configuration class for AI Pipeline"""
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')
    OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    
    # Model Parameters
    MODEL_TEMPERATURE = float(os.getenv('MODEL_TEMPERATURE', '0.1'))
    MODEL_MAX_TOKENS = int(os.getenv('MODEL_MAX_TOKENS', '500'))
    MODEL_TOP_P = float(os.getenv('MODEL_TOP_P', '0.9'))
    MODEL_FREQUENCY_PENALTY = float(os.getenv('MODEL_FREQUENCY_PENALTY', '0.1'))
    MODEL_PRESENCE_PENALTY = float(os.getenv('MODEL_PRESENCE_PENALTY', '0.1'))
    
    # Redis Configuration
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
    REDIS_DB = int(os.getenv('REDIS_DB', '0'))
    
    # AI Pipeline Configuration
    MESSAGE_TTL_HOURS = int(os.getenv('MESSAGE_TTL_HOURS', '168'))  # 7 days
    USER_TTL_HOURS = int(os.getenv('USER_TTL_HOURS', '720'))       # 30 days
    DUPLICATE_TTL_HOURS = int(os.getenv('DUPLICATE_TTL_HOURS', '1'))  # 1 hour
    
    # Extraction Configuration
    CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.3'))
    SIMILARITY_THRESHOLD = float(os.getenv('SIMILARITY_THRESHOLD', '0.8'))
    
    @classmethod
    def get_openai_model_kwargs(cls) -> Dict[str, Any]:
        """Get OpenAI model parameters"""
        return {
            "max_tokens": cls.MODEL_MAX_TOKENS,
            "top_p": cls.MODEL_TOP_P,
            "frequency_penalty": cls.MODEL_FREQUENCY_PENALTY,
            "presence_penalty": cls.MODEL_PRESENCE_PENALTY
        }
    
    @classmethod
    def validate(cls) -> bool:
        """Validate configuration"""
        if not cls.OPENAI_API_KEY:
            print("Warning: OPENAI_API_KEY not set")
            return False
        
        return True
    
    @classmethod
    def print_config(cls):
        """Print current configuration"""
        print("=== AI Pipeline Configuration ===")
        print(f"OpenAI Model: {cls.OPENAI_MODEL}")
        print(f"OpenAI Base URL: {cls.OPENAI_BASE_URL}")
        print(f"Temperature: {cls.MODEL_TEMPERATURE}")
        print(f"Max Tokens: {cls.MODEL_MAX_TOKENS}")
        print(f"Redis Host: {cls.REDIS_HOST}:{cls.REDIS_PORT}")
        print(f"Message TTL: {cls.MESSAGE_TTL_HOURS} hours")
        print(f"User TTL: {cls.USER_TTL_HOURS} hours")
        print(f"Confidence Threshold: {cls.CONFIDENCE_THRESHOLD}")
        print("=" * 35)

# Popular OpenAI model options
MODEL_OPTIONS = {
    "gpt-3.5-turbo": {
        "description": "Fast and cost-effective",
        "max_tokens": 4096,
        "cost_per_1k_tokens": 0.002
    },
    "gpt-4": {
        "description": "More capable, higher cost",
        "max_tokens": 8192,
        "cost_per_1k_tokens": 0.03
    },
    "gpt-4-turbo": {
        "description": "Latest GPT-4 with improved performance",
        "max_tokens": 128000,
        "cost_per_1k_tokens": 0.01
    },
    "gpt-3.5-turbo-16k": {
        "description": "Larger context window",
        "max_tokens": 16384,
        "cost_per_1k_tokens": 0.003
    }
}
