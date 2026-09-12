from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.routes import health, meeting, qa, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().ensure_dirs()
    yield


app = FastAPI(title="Clone vocal commercial", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
app.include_router(voice.router)
app.include_router(meeting.router)
app.include_router(qa.router)
