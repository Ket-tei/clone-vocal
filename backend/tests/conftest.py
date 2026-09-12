import asyncio.base_events
import io
import socket

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

HOTES_LOCAUX = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "testserver"}


def _nom_hote(valeur: object) -> str | None:
    """Normalise un hote en chaine comparable a HOTES_LOCAUX.

    socket.getaddrinfo recoit l'hote en bytes (b'exemple.invalid') quand
    l'appelant est asyncio : sans ce decodage, aucune comparaison ne
    correspondrait et l'espion laisserait tout passer.
    """
    if valeur is None:
        return None
    if isinstance(valeur, (bytes, bytearray)):
        return bytes(valeur).decode("utf-8", "replace")
    return str(valeur)


@pytest.fixture(autouse=True)
def sorties_reseau(monkeypatch):
    """Echoue si un test a ouvert une connexion vers un hote non local.

    L'auto-hebergement de cette application est motive par la confidentialite :
    la voix clonee est une donnee biometrique, et les briefs prospects portent
    des noms, des montants et des enjeux commerciaux. Cette fixture transforme
    cette promesse en propriete verifiee a CHAQUE test de la suite.

    Trois crochets complementaires, aucun ne suffit seul :

    - socket.socket.connect : les clients synchrones.
    - socket.getaddrinfo : toute cible nommee, y compris asynchrone. Sous
      WindowsProactorEventLoop, httpx.AsyncClient passe par ConnectEx et ne
      touche JAMAIS socket.socket.connect ; mesure a l'appui, seul le
      self-pipe local y apparait.
    - BaseEventLoop.create_connection : les cibles en IP litterale en
      asynchrone, que getaddrinfo ne voit pas (asyncio court-circuite la
      resolution quand l'hote est deja une adresse).

    L'assertion est au demontage, pas en derniere ligne d'un test : un echec
    anterieur masquerait sinon la fuite.

    Si cette fixture echoue, c'est un defaut bloquant : ne l'assouplissez
    jamais pour faire passer la suite.
    """
    vues: list[str] = []

    def noter(hote: object) -> None:
        nom = _nom_hote(hote)
        if nom and nom not in HOTES_LOCAUX:
            vues.append(nom)

    connect_reel = socket.socket.connect

    def connect_espion(self, adresse):
        if isinstance(adresse, tuple) and adresse:
            noter(adresse[0])
        return connect_reel(self, adresse)

    getaddrinfo_reel = socket.getaddrinfo

    def getaddrinfo_espion(host, port, *args, **kwargs):
        noter(host)
        return getaddrinfo_reel(host, port, *args, **kwargs)

    create_connection_reel = asyncio.base_events.BaseEventLoop.create_connection

    async def create_connection_espion(self, protocol_factory, host=None, port=None, **kw):
        noter(host)
        return await create_connection_reel(self, protocol_factory, host, port, **kw)

    monkeypatch.setattr(socket.socket, "connect", connect_espion)
    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo_espion)
    monkeypatch.setattr(
        asyncio.base_events.BaseEventLoop, "create_connection", create_connection_espion
    )

    yield vues

    assert vues == [], (
        f"Des connexions sont parties vers des hotes externes : "
        f"{sorted(set(vues))}. L'application doit fonctionner sans "
        f"aucune sortie reseau."
    )


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
