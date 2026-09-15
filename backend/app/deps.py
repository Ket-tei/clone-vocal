from functools import lru_cache

from app.capability import detect_vram_gb, select_tier
from app.config import get_settings
from app.db import connect, init_schema
from app.llm.ollama import LlmClient, OllamaClient
from app.stt.transcriber import Transcriber, get_transcriber
from app.voice.engine import TtsEngine, get_engine
from app.voice.store import VoiceStore


@lru_cache
def _store() -> VoiceStore:
    settings = get_settings()
    conn = connect(settings.db_path)
    init_schema(conn)
    return VoiceStore(conn, settings.voices_dir)

@lru_cache
def _llm() -> LlmClient:
    settings = get_settings()
    modele = settings.llm_model or select_tier(detect_vram_gb()).llm_model
    return OllamaClient(settings.ollama_url, modele, settings.ollama_timeout_s)

@lru_cache
def _tts() -> TtsEngine:
    settings = get_settings()
    return get_engine(settings.tts_engine, settings.torch_device)

@lru_cache
def _stt() -> Transcriber:
    settings = get_settings()
    return get_transcriber(settings.stt_engine, settings.torch_device)

def get_store() -> VoiceStore:
    return _store()

def get_llm() -> LlmClient:
    return _llm()

def get_tts() -> TtsEngine:
    return _tts()

def get_transcriber_dep() -> Transcriber:
    return _stt()
