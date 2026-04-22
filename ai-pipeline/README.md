# AI Pipeline - WhatsApp Invoice Extraction System

## Overview

This AI pipeline processes WhatsApp messages to extract invoice information using Google Gemini 2.5 Flash AI model. It consumes messages from Redis queues, performs intelligent extraction with extreme prompt engineering, handles deduplication, and publishes structured invoice data.

## Architecture

```
Backend (Go) -> Redis Queue -> AI Pipeline (Python) -> Redis Output
     |                    |                        |
HTTP POST           vyaap:queue:raw_chats:test_neo   processed_invoices
```

## File Structure & Branch Tree

```
ai-pipeline/
|
|--- ai_pipeline.py              # Main entry point - orchestrates entire pipeline
|--- gemini_extractor_fixed.py   # Gemini 2.5 Flash AI integration with extreme prompt engineering
|--- redis_manager.py            # Redis operations - consume, publish, deduplication keys
|--- deduplication_simple.py     # Message deduplication using exact key matching
|--- models.py                   # Data structures - WhatsAppMessage, InvoiceData
|--- config.py                   # Configuration management from environment variables
|--- requirements.txt            # Python dependencies
|--- .env.example                # Environment variables template
|--- .env                        # Actual environment variables (API keys, Redis config)
|--- check_queues.py             # Utility to monitor Redis queue status
|--- view_invoices.py            # Utility to view processed invoices in readable format
|--- send_test_messages.py       # Utility to send test messages and clear queues
```

## File Descriptions

### Core Files

#### `ai_pipeline.py`
- **Purpose**: Main orchestrator for the entire AI pipeline
- **Functions**: 
  - Initializes all components (Redis, Deduplication, Gemini)
  - Runs main processing loop
  - Handles message consumption, deduplication, extraction, and publishing
- **Key Classes**: `AIPipeline`

#### `gemini_extractor_fixed.py`
- **Purpose**: Integration with Google Gemini 2.5 Flash AI model
- **Functions**:
  - Extreme prompt engineering for Hinglish invoice extraction
  - JSON response parsing and validation
  - Fallback invoice creation for failed extractions
- **Key Classes**: `GeminiExtractor`

#### `redis_manager.py`
- **Purpose**: Redis connection and queue operations
- **Functions**:
  - Message consumption using BLPOP (blocking)
  - Publishing to output and error queues
  - Deduplication key management
- **Key Classes**: `RedisManager`

#### `deduplication_simple.py`
- **Purpose**: Message deduplication using exact key matching
- **Functions**:
  - Creates unique keys from chatname + sender + timestamp + message
  - Checks for duplicates using Redis
  - Marks messages as processed
- **Key Classes**: `DeduplicationEngine`

#### `models.py`
- **Purpose**: Data structure definitions
- **Classes**:
  - `WhatsAppMessage`: Structure for incoming messages
  - `InvoiceData`: Structure for extracted invoice information
  - `ProcessedMessage`: Structure for tracking processed messages

#### `config.py`
- **Purpose**: Configuration management
- **Functions**:
  - Loads environment variables
  - Validates required configuration
  - Provides configuration constants

### Utility Files

#### `check_queues.py`
- **Purpose**: Monitor Redis queue status
- **Functions**: Shows input/output/error queue lengths and contents

#### `view_invoices.py`
- **Purpose**: Display processed invoices in readable format
- **Functions**: Shows Order ID, Customer, Items, Confidence, Contact

#### `send_test_messages.py`
- **Purpose**: Testing utilities
- **Functions**: Send test messages, clear queues, check status

## Installation & Setup

### Prerequisites
- Python 3.8+
- Redis server (running on localhost:6379)
- Google Gemini API key
- Backend server running on port 8081

### Step 1: Install Dependencies
```bash
cd ai-pipeline
pip install -r requirements.txt
```

### Step 2: Configure Environment
```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your configuration
# Set GOOGLE_API_KEY, REDIS_HOST, etc.
```

### Step 3: Start Redis Server
```bash
# Option 1: Local Redis
redis-server

# Option 2: WSL Ubuntu
wsl -d Ubuntu redis-server --daemonize yes

# Option 3: Docker
docker run -d -p 6379:6379 redis:latest
```

### Step 4: Start Backend Server
```bash
cd ../backend
go run cmd/main.go
```

### Step 5: Start AI Pipeline
```bash
cd ai-pipeline
python ai_pipeline.py
```

## Running the System

### Complete Startup Sequence

**Terminal 1: Redis**
```bash
wsl -d Ubuntu redis-server --daemonize yes
```

**Terminal 2: Backend**
```bash
cd C:\Users\manoj\Vyaap\backend
go run cmd/main.go
```

**Terminal 3: AI Pipeline**
```bash
cd C:\Users\manoj\Vyaap\ai-pipeline
python ai_pipeline.py
```

**Terminal 4: Testing**
```bash
# Test backend health
curl http://localhost:8081/health

# Send test message
Invoke-RestMethod -Uri "http://localhost:8081/ingest" -Method POST -ContentType "application/json" -Body '{"chatName": "test_neo", "messages": [{"text": "Bhaiya 2 blue dupatta pack karo urgent delivery", "sender": "customer1", "timestamp": "13:00"}]}'

# View results
python view_invoices.py
```

## Configuration

### Environment Variables (.env)

```bash
# Gemini API Configuration
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_INPUT_QUEUE=vyaap:queue:raw_chats:test_neo
REDIS_OUTPUT_QUEUE=processed_invoices
REDIS_ERROR_QUEUE=processing_errors

# Processing Configuration
DUPLICATE_THRESHOLD=0.8
CONFIDENCE_THRESHOLD=0.5
MAX_MESSAGE_AGE_HOURS=24

# Logging Configuration
LOG_LEVEL=INFO
LOG_FILE=ai_pipeline.log
```

## Data Flow

1. **Ingestion**: Backend receives HTTP POST at `/ingest`
2. **Queuing**: Messages pushed to Redis `vyaap:queue:raw_chats:test_neo`
3. **Consumption**: AI pipeline consumes using BLPOP (blocking)
4. **Deduplication**: Checks for duplicates using MD5 hash of message content
5. **AI Processing**: Gemini 2.5 Flash extracts invoice information
6. **Output**: Structured JSON published to `processed_invoices` queue
7. **Error Handling**: Failed extractions go to `processing_errors` queue

## Extracted Data Structure

```json
{
  "order_id": "uuid-generated-automatically",
  "customer_name": "customer-name-if-mentioned",
  "items": [
    {
      "quantity": 2,
      "description": "blue dupatta"
    }
  ],
  "delivery_address": "address-if-mentioned",
  "contact_info": "sender-information",
  "special_instructions": "urgent-delivery-if-mentioned",
  "confidence_score": 0.8,
  "order_date": "2026-04-19T13:13:02.426695"
}
```

## Monitoring & Debugging

### Check System Status
```bash
python check_queues.py
```

### View Processed Invoices
```bash
python view_invoices.py
```

### Monitor Redis Activity
```bash
wsl -d Ubuntu redis-cli MONITOR
```

### Check Redis Keys
```bash
wsl -d Ubuntu redis-cli KEYS "*"
```

### Check Queue Lengths
```bash
wsl -d Ubuntu redis-cli llen "vyaap:queue:raw_chats:test_neo"
wsl -d Ubuntu redis-cli llen "processed_invoices"
wsl -d Ubuntu redis-cli llen "processing_errors"
```

## Testing

### Send Test Messages
```bash
python send_test_messages.py
# Choose option 1 to send test message
```

### Test Different Message Types
```bash
# Quantity + Product
Invoke-RestMethod -Uri "http://localhost:8081/ingest" -Method POST -ContentType "application/json" -Body '{"chatName": "test_neo", "messages": [{"text": "3 black shirts pack karo", "sender": "customer", "timestamp": "14:00"}]}'

# Size + Urgency
Invoke-RestMethod -Uri "http://localhost:8081/ingest" -Method POST -ContentType "application/json" -Body '{"chatName": "test_neo", "messages": [{"text": "blue jeans size L chahiye urgent", "sender": "customer", "timestamp": "14:15"}]}'

# Multiple items
Invoke-RestMethod -Uri "http://localhost:8081/ingest" -Method POST -ContentType "application/json" -Body '{"chatName": "test_neo", "messages": [{"text": "2 red dupatta aur 1 green shirt chahiye jaldi", "sender": "customer", "timestamp": "14:30"}]}'
```

## Troubleshooting

### Common Issues

#### Backend Not Running
```bash
# Check port usage
netstat -ano | findstr :8081

# Kill process if needed
taskkill /PID <PID> /F
```

#### Redis Connection Issues
```bash
# Test Redis
wsl -d Ubuntu redis-cli ping

# Check Redis keys
wsl -d Ubuntu redis-cli KEYS "*"
```

#### AI Pipeline Errors
```bash
# Check logs
tail -f ai-pipeline/ai_pipeline.log

# Clear errors
python -c "import redis; r=redis.Redis(); r.delete('processing_errors')"
```

#### Duplicate Messages
```bash
# Clear duplicate keys
python -c "import redis; r=redis.Redis(); [r.delete(key) for key in r.keys('processed:*')]"
```

## Performance & Scaling

### Current Configuration
- **Queue**: Redis with blocking consumption (BLPOP)
- **AI Model**: Gemini 2.5 Flash (fast, efficient)
- **Deduplication**: MD5 hash-based exact matching
- **Processing**: Single-threaded, can be scaled horizontally

### Scaling Options
- **Multiple AI Pipeline Instances**: Run multiple processes
- **Queue Partitioning**: Use multiple Redis queues
- **Batch Processing**: Process multiple messages per cycle
- **Caching**: Cache Gemini responses for similar messages

## Security Considerations

- **API Keys**: Store in environment variables, never commit to git
- **Redis Security**: Use Redis AUTH in production
- **Input Validation**: Backend validates input before queuing
- **Error Handling**: Sensitive data not logged

## Dependencies

### Python Packages
- `redis==5.0.1` - Redis client
- `langchain==0.1.0` - LangChain framework
- `langchain-google-genai==0.0.6` - Gemini integration
- `google-generativeai==0.3.2` - Google AI client
- `python-dotenv==1.0.0` - Environment variables
- `pandas==2.1.4` - Data manipulation
- `numpy==1.26.4` - Numerical operations
- `pydantic==2.5.3` - Data validation

### External Services
- **Redis Server**: Message queuing and deduplication
- **Google Gemini API**: AI-powered invoice extraction
- **Backend Server**: HTTP endpoint for message ingestion

## Development

### Adding New Features
1. Update models.py for new data structures
2. Add processing logic to gemini_extractor_fixed.py
3. Update configuration in config.py
4. Add tests to send_test_messages.py

### Debug Mode
```bash
# Set debug logging
export LOG_LEVEL=DEBUG
python ai_pipeline.py
```

### Production Deployment
- Use process manager (systemd, supervisor)
- Configure log rotation
- Set up monitoring and alerts
- Use Redis cluster for high availability

## License

This project is part of the Vyaap WhatsApp invoice extraction system.
