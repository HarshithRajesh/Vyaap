"""
Configuration Management for AI Pipeline
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Configuration class for AI pipeline"""
    
    # Gemini API Configuration
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-pro")
    
    # Redis Configuration
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
    REDIS_DB = int(os.getenv("REDIS_DB", 0))
    REDIS_INPUT_QUEUE = os.getenv("REDIS_INPUT_QUEUE", "test_neo")
    REDIS_OUTPUT_QUEUE = os.getenv("REDIS_OUTPUT_QUEUE", "processed_invoices")
    REDIS_ERROR_QUEUE = os.getenv("REDIS_ERROR_QUEUE", "processing_errors")
    
    # Processing Configuration
    DUPLICATE_THRESHOLD = float(os.getenv("DUPLICATE_THRESHOLD", 0.8))
    CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.5))
    MAX_MESSAGE_AGE_HOURS = int(os.getenv("MAX_MESSAGE_AGE_HOURS", 24))
    
    # Logging Configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = os.getenv("LOG_FILE", "ai_pipeline.log")
    
    @classmethod
    def validate(cls):
        """Validate required configuration"""
        if not cls.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is required")
        return True
