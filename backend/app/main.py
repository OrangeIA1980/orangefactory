from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, proyectos

app = FastAPI(
    title="OrangeFactory API",
    version="0.1.0",
    description="El software que corre tu fabrica Orange.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.environment == "development" else ["https://orangefactory.cl"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(proyectos.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "orangefactory-api", "environment": settings.environment}


@app.get("/")
def root():
    return {"name": "OrangeFactory API", "docs": "/docs"}
