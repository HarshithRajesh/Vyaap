"""
API Server for AI Pipeline
Provides endpoints for invoice retrieval and tracking
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import json
import asyncio
from ai_pipeline import AIPipeline, InvoiceData, WhatsAppMessage

app = FastAPI(title="AI Pipeline API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global pipeline instance
pipeline = None

class MessageRequest(BaseModel):
    """Request model for message processing"""
    chatName: str
    messages: List[Dict[str, str]]

class InvoiceRequest(BaseModel):
    """Request model for invoice retrieval"""
    chat_name: str
    hours: Optional[int] = 24

class RevenueRequest(BaseModel):
    """Request model for revenue report"""
    chat_name: str
    days: Optional[int] = 7

class InvoiceResponse(BaseModel):
    """Response model for invoice data"""
    success: bool
    invoices: List[Dict[str, Any]]
    total_count: int
    total_revenue: float

class RevenueResponse(BaseModel):
    """Response model for revenue data"""
    success: bool
    data: Dict[str, Any]

@app.on_event("startup")
async def startup_event():
    """Initialize the pipeline on startup"""
    global pipeline
    pipeline = AIPipeline()
    
    # Start the pipeline worker in background
    asyncio.create_task(run_pipeline_worker())

async def run_pipeline_worker():
    """Run the pipeline worker in background"""
    if pipeline:
        try:
            # This will run the worker in background
            print("[API] Starting pipeline worker in background...")
            # In production, you'd want to handle this more gracefully
            # For now, we'll start it but not block the API
            import threading
            worker_thread = threading.Thread(target=pipeline.start_worker, daemon=True)
            worker_thread.start()
        except Exception as e:
            print(f"[API] Error starting pipeline worker: {e}")

@app.post("/ingest")
async def ingest_messages(request: MessageRequest):
    """Ingest WhatsApp messages for processing"""
    try:
        # Convert to JSON and send to Redis queue
        message_data = {
            "chatName": request.chatName,
            "messages": request.messages
        }
        
        # Send to Redis queue (simulated - in production, this would go to Redis)
        if pipeline:
            raw_data = json.dumps(message_data)
            # Simulate Redis push by processing directly
            pipeline.process_message(raw_data)
        
        return {"status": "success", "message": f"Processed {len(request.messages)} messages"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing messages: {str(e)}")

@app.post("/invoices", response_model=InvoiceResponse)
async def get_invoices(request: InvoiceRequest):
    """Get invoices for a specific chat"""
    try:
        if not pipeline:
            raise HTTPException(status_code=500, detail="Pipeline not initialized")
        
        invoices = pipeline.get_user_invoices(request.chat_name, request.hours)
        
        # Calculate total revenue
        total_revenue = sum(inv.total_amount or 0 for inv in invoices)
        
        return InvoiceResponse(
            success=True,
            invoices=[inv.dict() for inv in invoices],
            total_count=len(invoices),
            total_revenue=total_revenue
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving invoices: {str(e)}")

@app.post("/revenue", response_model=RevenueResponse)
async def get_revenue_report(request: RevenueRequest):
    """Get revenue report for a specific chat"""
    try:
        if not pipeline:
            raise HTTPException(status_code=500, detail="Pipeline not initialized")
        
        report = pipeline.generate_revenue_report(request.chat_name, request.days)
        
        return RevenueResponse(
            success=True,
            data=report
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating revenue report: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "pipeline_initialized": pipeline is not None,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/users")
async def get_users():
    """Get all users (chats) in the system"""
    try:
        if not pipeline:
            raise HTTPException(status_code=500, detail="Pipeline not initialized")
        
        users = []
        for user_id, user_data in pipeline.vector_store.user_data.items():
            users.append({
                "user_id": user_id,
                "chat_name": user_data["chat_name"],
                "message_count": len(user_data["messages"]),
                "invoice_count": len(user_data["invoices"]),
                "last_updated": user_data["last_updated"].isoformat()
            })
        
        return {"success": True, "users": users}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving users: {str(e)}")

@app.get("/stats")
async def get_system_stats():
    """Get system statistics"""
    try:
        if not pipeline:
            raise HTTPException(status_code=500, detail="Pipeline not initialized")
        
        total_users = len(pipeline.vector_store.user_data)
        total_messages = sum(len(user_data["messages"]) for user_data in pipeline.vector_store.user_data.values())
        total_invoices = sum(len(user_data["invoices"]) for user_data in pipeline.vector_store.user_data.values())
        
        return {
            "success": True,
            "stats": {
                "total_users": total_users,
                "total_messages": total_messages,
                "total_invoices": total_invoices,
                "processed_messages": len(pipeline.processed_messages),
                "vector_index_size": pipeline.vector_store.index.ntotal
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving stats: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
