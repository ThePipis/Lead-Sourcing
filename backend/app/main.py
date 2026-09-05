import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import campaigns, prospecting, curation, export

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Co-Op Direct Mail Platform & Algorithmic Audience Curation Engine",
    description="Backend API for Shared Direct Mail Automation in the Inland Empire, California.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount modular routers
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(prospecting.router, prefix="/api/v1")
app.include_router(curation.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "Co-Op Direct Mail Engine",
        "market": "Inland Empire, CA",
        "target_specs": "12x9 Jumbo Postcard | 14 Exclusive Slots | 5,000 Homes"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
