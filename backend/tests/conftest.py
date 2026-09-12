import io

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app import deps
from app.db import connect, init_schema
from app.llm.ollama import FakeLlmClient
from app.main import app
from app.stt.transcriber import FakeTranscriber
from app.voice.engine import FakeTtsEngine
from app.voice.store import VoiceStore

SCRIPT_BRUT = """[accroche]
Bonjour Claire, merci de votre temps.
[probleme]
Vos factures coutent cher a traiter.
[solution]
Notre outil automatise la saisie.
[preuve]
Un client a divise son delai par quatre.
[next_step]
On se cale un point technique ?"""

@pytest.fixture
def client(tmp_path):
    conn = connect(tmp_path / "t.sqlite")
    init_schema(conn)
    store = VoiceStore(conn, tmp_path / "voices")
    tts = FakeTtsEngine()
    llm = FakeLlmClient([SCRIPT_BRUT] * 20)
    stt = FakeTranscriber(["Quel est le prix ?"] * 20)

    app.dependency_overrides[deps.get_store] = lambda: store
    app.dependency_overrides[deps.get_tts] = lambda: tts
    app.dependency_overrides[deps.get_llm] = lambda: llm
    app.dependency_overrides[deps.get_transcriber_dep] = lambda: stt
    # Le gestionnaire de contexte est obligatoire : sans lui, Starlette n'emet
    # jamais le scope lifespan et le demarrage de l'application ne s'execute pas.
    with TestClient(app) as testeur:
        yield testeur
    app.dependency_overrides.clear()

@pytest.fixture
def wav_valide():
    """Meme normalisation obligatoire que _wav() en tache 10 : sans elle le
    bruit gaussien depasse la pleine echelle et validate() rejette."""
    sr, duree = 24000, 45.0
    n = int(duree * sr)
    rng = np.random.default_rng(0)
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / sr)
    signal = rng.normal(0, 0.3, n) * env
    signal = signal / np.max(np.abs(signal)) * 0.7
    tampon = io.BytesIO()
    sf.write(tampon, signal.astype(np.float32), sr, format="WAV")
    return tampon.getvalue()

@pytest.fixture
def llm_espion(client):
    """Le FakeLlmClient injecte par la fixture client, pour inspecter les prompts."""
    return app.dependency_overrides[deps.get_llm]()
