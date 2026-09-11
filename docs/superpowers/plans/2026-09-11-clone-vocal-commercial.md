# Clone vocal commercial — plan d'implémentation (phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Construire une application web 100 % locale qui clone la voix de l'utilisateur, reçoit le contexte d'un rendez-vous commercial, délivre une présentation avec cette voix et répond aux questions posées au micro.

**Architecture :** Un backend FastAPI héberge en process les moteurs de synthèse (Chatterbox) et de transcription (Kyutai STT), et parle à Ollama en HTTP pour le LLM. Un frontend Next.js gère l'onboarding, le brief et la session. Chaque moteur est défini par un `Protocol` Python avec une implémentation réelle et une doublure, pour que toute la logique soit testable sans GPU.

**Tech Stack :** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, SQLite (stdlib `sqlite3`), NumPy, soundfile, httpx, pytest, pytest-asyncio, ruff. Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui. Ollama.

## Global Constraints

Ces règles s'appliquent à **toutes** les tâches. Les exigences de chaque tâche les incluent implicitement.

- **Aucun appel réseau sortant en fonctionnement nominal.** Seule exception : le téléchargement des poids à l'installation. La tâche 13 le vérifie automatiquement.
- **Langue du produit : français.** Interface, prompts LLM, script d'onboarding, messages d'erreur.
- **Licences des moteurs : MIT uniquement.** Chatterbox et OpenVoice V2 sont autorisés. **XTTS v2 et F5-TTS sont interdits** — licences non commerciales, et `buisness_vision` a vocation à devenir un produit.
- **La CI ne doit jamais exiger un GPU.** Tout test marqué sans `@pytest.mark.gpu` doit passer sur une machine sans carte NVIDIA.
- **Aucune donnée biométrique dans git.** Les `.wav`, `/data/`, `/voices/`, `*.sqlite` sont déjà bloqués par le `.gitignore` à la racine. Ne jamais le desserrer.
- **Paliers VRAM** (exactement ces valeurs) : `>= 12 Go` → `qwen3:8b-q4_K_M` ; `>= 8 Go et < 12 Go` → `qwen3:4b-q4_K_M` ; `< 8 Go` → refus au démarrage.
- **Seuils de validation audio** (exactement ces valeurs) : durée entre `30.0` et `120.0` s ; `peak_dbfs` entre `-18.0` et `-1.0` ; `silence_ratio <= 0.35` ; `snr_db >= 20.0`.
- **Cible de latence** : premiers mots audibles en 1 à 2 s. Le streaming par phrase est obligatoire, pas optionnel.
- **Commits** : un par tâche minimum, en français, format `feat:` / `test:` / `chore:`.

## Écart assumé par rapport à la spec

La spec §3 plaçait le STT Kyutai dans un conteneur `moshi-server` séparé, joint en WebSocket. **Ce plan l'exécute en process dans le backend, en transcription par lot.** Justification : l'interaction est en tour par tour, donc la transcription en streaming n'apporte rien ; cela supprime un conteneur et un protocole WebSocket msgpack. Le contrat `Transcriber` de la tâche 9 reste identique, donc revenir à un serveur séparé plus tard ne touchera qu'un fichier.

---

## Structure des fichiers

```
backend/
  pyproject.toml
  app/
    __init__.py
    config.py            Settings, chemins, paliers de modèles
    main.py              application FastAPI, montage des routes
    capability.py        détection VRAM et choix du palier
    db.py                schéma SQLite et connexion
    audio/
      __init__.py
      validation.py      métriques et seuils de l'échantillon vocal
      chunking.py        flux de tokens -> phrases prononçables
    voice/
      __init__.py
      store.py           CRUD des profils vocaux, suppression réelle
      engine.py          Protocol TtsEngine, Chatterbox, doublure
    stt/
      __init__.py
      transcriber.py     Protocol Transcriber, Kyutai, doublure
    llm/
      __init__.py
      ollama.py          Protocol LlmClient, Ollama streaming, doublure
    meeting/
      __init__.py
      brief.py           modèle MeetingBrief
      script.py          prompts et découpage du script en blocs
    routes/
      __init__.py
      health.py
      voice.py
      meeting.py
      qa.py              WebSocket de la boucle question/réponse
  tests/
    conftest.py
    test_*.py

frontend/
  package.json
  app/
    layout.tsx
    page.tsx                    accueil
    onboarding/page.tsx         test micro, lecture, contrôle qualité
    brief/page.tsx              formulaire de contexte prospect
    session/[id]/page.tsx       présentation et boucle Q/R
  components/
    MicLevelMeter.tsx
    RecordingStudio.tsx
    QualityReport.tsx
    BriefForm.tsx
    TranscriptStream.tsx
  lib/
    api.ts                      client HTTP du backend
    audio.ts                    MediaRecorder et lecture en file

docker-compose.yml
README.md
```

**Frontières.** `voice/engine.py` ignore tout du contexte prospect. `meeting/script.py` ignore tout de l'audio. `audio/chunking.py` ne dépend d'aucun moteur. Chaque moteur externe est derrière un `Protocol`, ce qui rend tout le reste testable sans GPU.

---

### Task 1 : Socle backend et point de santé

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/routes/health.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: rien (première tâche)
- Produces: `app.config.Settings` avec les attributs `data_dir: Path`, `voices_dir: Path`, `db_path: Path`, `ollama_url: str` ; `app.config.get_settings() -> Settings` ; l'application FastAPI `app.main.app` ; la fixture pytest `client` renvoyant un `fastapi.testclient.TestClient`.

- [ ] **Step 1: Créer le manifeste du projet**

```toml
# backend/pyproject.toml
[project]
name = "clone-vocal-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "httpx>=0.27",
    "numpy>=2.0",
    "soundfile>=0.12",
    "python-multipart>=0.0.12",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "ruff>=0.7"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
markers = ["gpu: exige un GPU NVIDIA, exclu de la CI"]

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Écrire la configuration**

```python
# backend/app/config.py
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    data_dir: Path = Path("data")
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_timeout_s: float = 120.0

    @property
    def voices_dir(self) -> Path:
        return self.data_dir / "voices"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.sqlite"

    def ensure_dirs(self) -> None:
        self.voices_dir.mkdir(parents=True, exist_ok=True)

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: Écrire le test de santé (il doit échouer)**

```python
# backend/tests/test_health.py
def test_health_repond_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

```python
# backend/tests/conftest.py
import pytest
from fastapi.testclient import TestClient

from app.main import app

@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
```

- [ ] **Step 4: Lancer le test et vérifier qu'il échoue**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 5: Écrire l'implémentation minimale**

```python
# backend/app/routes/health.py
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

```python
# backend/app/main.py
from fastapi import FastAPI

from app.config import get_settings
from app.routes import health

app = FastAPI(title="Clone vocal commercial", version="0.1.0")
app.include_router(health.router)

@app.on_event("startup")
def _startup() -> None:
    get_settings().ensure_dirs()
```

Créer aussi les fichiers vides `backend/app/__init__.py` et `backend/app/routes/__init__.py`.

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: socle backend FastAPI avec point de sante"
```

---

### Task 2 : Détection de VRAM et choix du palier

**Files:**
- Create: `backend/app/capability.py`
- Test: `backend/tests/test_capability.py`

**Interfaces:**
- Consumes: rien
- Produces: `ModelTier` (dataclass gelée : `name: str`, `llm_model: str`, `min_vram_gb: float`) ; `TIERS: list[ModelTier]` ; `select_tier(vram_gb: float | None) -> ModelTier` qui lève `InsufficientVramError` sous 8 Go ; `detect_vram_gb() -> float | None` ; `InsufficientVramError(Exception)`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_capability.py
import pytest

from app.capability import InsufficientVramError, select_tier

def test_16_go_donne_le_palier_haut():
    assert select_tier(16.0).llm_model == "qwen3:8b-q4_K_M"

def test_12_go_pile_donne_le_palier_haut():
    assert select_tier(12.0).llm_model == "qwen3:8b-q4_K_M"

def test_10_go_donne_le_palier_median():
    assert select_tier(10.0).llm_model == "qwen3:4b-q4_K_M"

def test_8_go_pile_donne_le_palier_median():
    assert select_tier(8.0).llm_model == "qwen3:4b-q4_K_M"

def test_sous_8_go_refuse():
    with pytest.raises(InsufficientVramError) as err:
        select_tier(6.0)
    assert "6.0" in str(err.value)

def test_vram_inconnue_refuse():
    with pytest.raises(InsufficientVramError):
        select_tier(None)
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_capability.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.capability'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/capability.py
import shutil
import subprocess
from dataclasses import dataclass

class InsufficientVramError(Exception):
    pass

@dataclass(frozen=True)
class ModelTier:
    name: str
    llm_model: str
    min_vram_gb: float

TIERS: list[ModelTier] = [
    ModelTier(name="haut", llm_model="qwen3:8b-q4_K_M", min_vram_gb=12.0),
    ModelTier(name="median", llm_model="qwen3:4b-q4_K_M", min_vram_gb=8.0),
]

def select_tier(vram_gb: float | None) -> ModelTier:
    if vram_gb is None:
        raise InsufficientVramError(
            "Aucun GPU NVIDIA detecte. Cette application exige une carte "
            "d'au moins 8 Go de VRAM."
        )
    for tier in TIERS:
        if vram_gb >= tier.min_vram_gb:
            return tier
    raise InsufficientVramError(
        f"VRAM detectee : {vram_gb} Go. Le minimum requis est 8.0 Go."
    )

def detect_vram_gb() -> float | None:
    if shutil.which("nvidia-smi") is None:
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    first = out.stdout.strip().splitlines()
    if not first:
        return None
    try:
        return round(int(first[0].strip()) / 1024, 1)
    except ValueError:
        return None
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_capability.py -v`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/capability.py backend/tests/test_capability.py
git commit -m "feat: detection VRAM et selection du palier de modele"
```

---

### Task 3 : Validation de l'échantillon vocal

C'est le garde-fou le plus important du produit : un échantillon médiocre condamne toute la crédibilité en aval.

**Files:**
- Create: `backend/app/audio/__init__.py`
- Create: `backend/app/audio/validation.py`
- Test: `backend/tests/test_audio_validation.py`

**Interfaces:**
- Consumes: rien
- Produces: `AudioMetrics` (dataclass gelée : `duration_s: float`, `peak_dbfs: float`, `silence_ratio: float`, `snr_db: float`) ; `analyze(path: Path) -> AudioMetrics` ; `ValidationResult` (dataclass gelée : `ok: bool`, `problems: list[str]`) ; `validate(metrics: AudioMetrics) -> ValidationResult`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_audio_validation.py
import numpy as np
import pytest
import soundfile as sf

from app.audio.validation import AudioMetrics, analyze, validate

SR = 24000

def _ecrire(tmp_path, signal, nom="e.wav"):
    chemin = tmp_path / nom
    sf.write(chemin, signal.astype(np.float32), SR)
    return chemin

def _parole(duree_s, amplitude=0.3):
    """Bruit module en amplitude : imite grossierement de la parole."""
    n = int(duree_s * SR)
    rng = np.random.default_rng(0)
    enveloppe = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / SR)
    return rng.normal(0, amplitude, n) * enveloppe

def _metriques(**kwargs):
    base = {"duration_s": 45.0, "peak_dbfs": -6.0, "silence_ratio": 0.1, "snr_db": 30.0}
    return AudioMetrics(**{**base, **kwargs})

def test_analyze_mesure_la_duree(tmp_path):
    chemin = _ecrire(tmp_path, _parole(2.0))
    assert analyze(chemin).duration_s == pytest.approx(2.0, abs=0.05)

def test_analyze_detecte_la_saturation(tmp_path):
    chemin = _ecrire(tmp_path, np.ones(SR) * 0.999)
    assert analyze(chemin).peak_dbfs > -1.0

def test_analyze_mesure_le_silence(tmp_path):
    signal = np.concatenate([_parole(1.0), np.zeros(SR)])
    assert analyze(_ecrire(tmp_path, signal)).silence_ratio == pytest.approx(0.5, abs=0.15)

def test_echantillon_conforme_est_accepte():
    assert validate(_metriques()).ok is True

def test_trop_court_est_refuse():
    resultat = validate(_metriques(duration_s=12.0))
    assert resultat.ok is False
    assert any("30" in p for p in resultat.problems)

def test_trop_long_est_refuse():
    assert validate(_metriques(duration_s=150.0)).ok is False

def test_sature_est_refuse():
    resultat = validate(_metriques(peak_dbfs=-0.2))
    assert any("sature" in p.lower() for p in resultat.problems)

def test_trop_faible_est_refuse():
    resultat = validate(_metriques(peak_dbfs=-30.0))
    assert any("faible" in p.lower() for p in resultat.problems)

def test_trop_de_silence_est_refuse():
    assert validate(_metriques(silence_ratio=0.6)).ok is False

def test_trop_bruite_est_refuse():
    resultat = validate(_metriques(snr_db=9.0))
    assert any("bruit" in p.lower() for p in resultat.problems)

def test_plusieurs_problemes_sont_tous_listes():
    resultat = validate(_metriques(duration_s=5.0, snr_db=3.0))
    assert len(resultat.problems) == 2
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_audio_validation.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.audio'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/audio/validation.py
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

MIN_DUREE_S = 30.0
MAX_DUREE_S = 120.0
PEAK_MIN_DBFS = -18.0
PEAK_MAX_DBFS = -1.0
MAX_SILENCE_RATIO = 0.35
MIN_SNR_DB = 20.0

_SEUIL_SILENCE_DBFS = -50.0
_FENETRE_MS = 20

@dataclass(frozen=True)
class AudioMetrics:
    duration_s: float
    peak_dbfs: float
    silence_ratio: float
    snr_db: float

@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    problems: list[str]

def _dbfs(x: float) -> float:
    return 20.0 * np.log10(max(float(x), 1e-10))

def analyze(path: Path) -> AudioMetrics:
    signal, sr = sf.read(str(path), dtype="float32", always_2d=True)
    mono = signal.mean(axis=1)
    duree = len(mono) / sr

    taille = max(1, int(sr * _FENETRE_MS / 1000))
    complet = len(mono) - (len(mono) % taille)
    fenetres = mono[:complet].reshape(-1, taille) if complet else mono.reshape(1, -1)
    rms = np.sqrt(np.mean(fenetres**2, axis=1))
    rms_db = np.array([_dbfs(v) for v in rms])

    silence = rms_db < _SEUIL_SILENCE_DBFS
    ratio_silence = float(silence.mean())

    actives = rms_db[~silence]
    if actives.size >= 2:
        plancher = float(np.percentile(actives, 10))
        utile = float(np.percentile(actives, 90))
        snr = utile - plancher
    else:
        snr = 0.0

    return AudioMetrics(
        duration_s=round(duree, 3),
        peak_dbfs=round(_dbfs(np.max(np.abs(mono)) if mono.size else 0.0), 2),
        silence_ratio=round(ratio_silence, 3),
        snr_db=round(snr, 2),
    )

def validate(metrics: AudioMetrics) -> ValidationResult:
    problems: list[str] = []
    if metrics.duration_s < MIN_DUREE_S:
        problems.append(
            f"Enregistrement trop court : {metrics.duration_s:.0f} s. "
            f"Il en faut au moins {MIN_DUREE_S:.0f}."
        )
    elif metrics.duration_s > MAX_DUREE_S:
        problems.append(
            f"Enregistrement trop long : {metrics.duration_s:.0f} s. "
            f"Maximum {MAX_DUREE_S:.0f}."
        )
    if metrics.peak_dbfs > PEAK_MAX_DBFS:
        problems.append(
            "Le son est sature : vous etes trop pres du micro ou le gain est trop haut."
        )
    elif metrics.peak_dbfs < PEAK_MIN_DBFS:
        problems.append(
            "Le son est trop faible : rapprochez-vous du micro ou montez le gain."
        )
    if metrics.silence_ratio > MAX_SILENCE_RATIO:
        problems.append(
            f"Trop de silence ({metrics.silence_ratio:.0%}). Lisez le texte sans longues pauses."
        )
    if metrics.snr_db < MIN_SNR_DB:
        problems.append(
            "Trop de bruit de fond. Fermez les fenetres et coupez ventilateur ou musique."
        )
    return ValidationResult(ok=not problems, problems=problems)
```

Créer aussi `backend/app/audio/__init__.py` vide.

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_audio_validation.py -v`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/audio/ backend/tests/test_audio_validation.py
git commit -m "feat: metriques et validation de l'echantillon vocal"
```

---

### Task 4 : Persistance SQLite et magasin de profils vocaux

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/voice/__init__.py`
- Create: `backend/app/voice/store.py`
- Test: `backend/tests/test_voice_store.py`

**Interfaces:**
- Consumes: `app.config.Settings` (tâche 1), `AudioMetrics` (tâche 3)
- Produces: `app.db.connect(db_path: Path) -> sqlite3.Connection` ; `app.db.init_schema(conn)` ; `VoiceProfile` (dataclass gelée : `id: str`, `label: str`, `created_at: str`, `sample_path: str`, `duration_s: float`, `snr_db: float`, `peak_dbfs: float`, `engine: str`) ; `VoiceStore(conn, voices_dir)` avec `create(label, sample_bytes, metrics, engine="chatterbox") -> VoiceProfile`, `get(id) -> VoiceProfile | None`, `list() -> list[VoiceProfile]`, `delete(id) -> bool`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_voice_store.py
import pytest

from app.audio.validation import AudioMetrics
from app.db import connect, init_schema
from app.voice.store import VoiceStore

METRIQUES = AudioMetrics(duration_s=45.0, peak_dbfs=-6.0, silence_ratio=0.1, snr_db=30.0)

@pytest.fixture
def store(tmp_path):
    conn = connect(tmp_path / "t.sqlite")
    init_schema(conn)
    voices = tmp_path / "voices"
    voices.mkdir()
    return VoiceStore(conn, voices)

def test_create_ecrit_le_fichier_et_la_ligne(store):
    profil = store.create("Ma voix", b"RIFFfake", METRIQUES)
    assert store.get(profil.id) == profil
    assert (store.voices_dir / f"{profil.id}.wav").read_bytes() == b"RIFFfake"

def test_create_reporte_les_metriques(store):
    profil = store.create("Ma voix", b"x", METRIQUES)
    assert profil.duration_s == 45.0
    assert profil.snr_db == 30.0
    assert profil.engine == "chatterbox"

def test_get_inconnu_renvoie_none(store):
    assert store.get("inexistant") is None

def test_list_est_trie_du_plus_recent_au_plus_ancien(store):
    a = store.create("A", b"x", METRIQUES)
    b = store.create("B", b"x", METRIQUES)
    assert [p.id for p in store.list()] == [b.id, a.id]

def test_delete_efface_vraiment_le_fichier(store):
    profil = store.create("Ma voix", b"x", METRIQUES)
    chemin = store.voices_dir / f"{profil.id}.wav"
    assert store.delete(profil.id) is True
    assert not chemin.exists()
    assert store.get(profil.id) is None

def test_delete_inconnu_renvoie_false(store):
    assert store.delete("inexistant") is False
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_voice_store.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/db.py
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS voice_profiles (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sample_path TEXT NOT NULL,
    duration_s REAL NOT NULL,
    snr_db REAL NOT NULL,
    peak_dbfs REAL NOT NULL,
    engine TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
    voice_profile_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    script_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    latency_ms INTEGER
);
"""

def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
```

```python
# backend/app/voice/store.py
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.audio.validation import AudioMetrics

@dataclass(frozen=True)
class VoiceProfile:
    id: str
    label: str
    created_at: str
    sample_path: str
    duration_s: float
    snr_db: float
    peak_dbfs: float
    engine: str

class VoiceStore:
    def __init__(self, conn: sqlite3.Connection, voices_dir: Path) -> None:
        self.conn = conn
        self.voices_dir = voices_dir
        self.voices_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self, label: str, sample_bytes: bytes, metrics: AudioMetrics,
        engine: str = "chatterbox",
    ) -> VoiceProfile:
        profil_id = uuid.uuid4().hex
        chemin = self.voices_dir / f"{profil_id}.wav"
        chemin.write_bytes(sample_bytes)
        profil = VoiceProfile(
            id=profil_id,
            label=label,
            created_at=datetime.now(timezone.utc).isoformat(),
            sample_path=str(chemin),
            duration_s=metrics.duration_s,
            snr_db=metrics.snr_db,
            peak_dbfs=metrics.peak_dbfs,
            engine=engine,
        )
        self.conn.execute(
            "INSERT INTO voice_profiles VALUES (:id, :label, :created_at, :sample_path,"
            " :duration_s, :snr_db, :peak_dbfs, :engine)",
            profil.__dict__,
        )
        self.conn.commit()
        return profil

    def get(self, profil_id: str) -> VoiceProfile | None:
        row = self.conn.execute(
            "SELECT * FROM voice_profiles WHERE id = ?", (profil_id,)
        ).fetchone()
        return VoiceProfile(**dict(row)) if row else None

    def list(self) -> list[VoiceProfile]:
        rows = self.conn.execute(
            "SELECT * FROM voice_profiles ORDER BY created_at DESC, rowid DESC"
        ).fetchall()
        return [VoiceProfile(**dict(r)) for r in rows]

    def delete(self, profil_id: str) -> bool:
        profil = self.get(profil_id)
        if profil is None:
            return False
        Path(profil.sample_path).unlink(missing_ok=True)
        self.conn.execute("DELETE FROM voice_profiles WHERE id = ?", (profil_id,))
        self.conn.commit()
        return True
```

Créer aussi `backend/app/voice/__init__.py` vide.

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_voice_store.py -v`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/db.py backend/app/voice/ backend/tests/test_voice_store.py
git commit -m "feat: persistance SQLite et magasin de profils vocaux"
```

---

### Task 5 : Découpage d'un flux de tokens en phrases prononçables

Sans ce composant, le streaming est impossible et l'utilisateur attend 5 à 8 s en silence.

**Files:**
- Create: `backend/app/audio/chunking.py`
- Test: `backend/tests/test_chunking.py`

**Interfaces:**
- Consumes: rien
- Produces: `SentenceChunker(min_chars: int = 25)` avec `feed(fragment: str) -> list[str]` (renvoie les phrases complètes disponibles) et `flush() -> str | None` (renvoie le reste).

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_chunking.py
from app.audio.chunking import SentenceChunker

def _tout(chunker, texte):
    """Alimente caractere par caractere : imite un flux de tokens."""
    phrases = []
    for c in texte:
        phrases.extend(chunker.feed(c))
    reste = chunker.flush()
    if reste:
        phrases.append(reste)
    return phrases

def test_phrase_simple():
    assert _tout(SentenceChunker(), "Bonjour a vous.") == ["Bonjour a vous."]

def test_deux_phrases_sont_separees():
    phrases = _tout(SentenceChunker(), "Bonjour a tous. Comment allez-vous ?")
    assert phrases == ["Bonjour a tous.", "Comment allez-vous ?"]

def test_abreviation_ne_coupe_pas():
    phrases = _tout(SentenceChunker(), "Je vois M. Dupont demain matin sans faute.")
    assert phrases == ["Je vois M. Dupont demain matin sans faute."]

def test_nombre_decimal_ne_coupe_pas():
    phrases = _tout(SentenceChunker(), "Le taux atteint 3.14 pour cent cette annee.")
    assert phrases == ["Le taux atteint 3.14 pour cent cette annee."]

def test_fragment_trop_court_est_fusionne():
    phrases = _tout(SentenceChunker(), "Oui. Absolument, je partage votre analyse.")
    assert phrases == ["Oui. Absolument, je partage votre analyse."]

def test_point_exclamation_coupe():
    phrases = _tout(SentenceChunker(), "C'est exactement notre sujet ! Regardons les chiffres.")
    assert len(phrases) == 2

def test_flush_rend_le_reste_sans_ponctuation():
    chunker = SentenceChunker()
    chunker.feed("Une phrase inachevee")
    assert chunker.flush() == "Une phrase inachevee"

def test_flush_vide_apres_coup():
    chunker = SentenceChunker()
    chunker.feed("Termine par un point final complet.")
    chunker.flush()
    assert chunker.flush() is None

def test_la_premiere_phrase_sort_avant_la_fin_du_flux():
    """Le coeur du streaming : ne pas attendre la fin pour parler."""
    chunker = SentenceChunker()
    sorties = chunker.feed("Voici la premiere phrase complete. Et la suite arrive")
    assert sorties == ["Voici la premiere phrase complete."]
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_chunking.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.audio.chunking'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/audio/chunking.py
import re

_ABREVIATIONS = {
    "m", "mm", "mme", "mlle", "dr", "pr", "me", "st", "ste",
    "etc", "cf", "ex", "env", "tel", "av", "bd",
}
_FINS = ".!?…"
_MOT_FINAL = re.compile(r"([A-Za-zÀ-ÿ]+)\.$")

class SentenceChunker:
    """Assemble un flux de fragments en phrases prononcables."""

    def __init__(self, min_chars: int = 25) -> None:
        self.min_chars = min_chars
        self._tampon = ""

    def feed(self, fragment: str) -> list[str]:
        self._tampon += fragment
        pretes: list[str] = []
        while True:
            phrase = self._extraire()
            if phrase is None:
                return pretes
            pretes.append(phrase)

    def _extraire(self) -> str | None:
        for i, c in enumerate(self._tampon):
            if c not in _FINS:
                continue
            candidat = self._tampon[: i + 1]
            suivant = self._tampon[i + 1 : i + 2]
            if suivant and not suivant.isspace():
                continue  # ex. 3.14 : le point est interne
            if len(candidat.strip()) < self.min_chars:
                continue  # fragment trop court, on le fusionne avec la suite
            if self._est_abreviation(candidat):
                continue
            self._tampon = self._tampon[i + 1 :].lstrip()
            return candidat.strip()
        return None

    @staticmethod
    def _est_abreviation(candidat: str) -> bool:
        m = _MOT_FINAL.search(candidat.strip())
        return bool(m) and m.group(1).lower() in _ABREVIATIONS

    def flush(self) -> str | None:
        reste = self._tampon.strip()
        self._tampon = ""
        return reste or None
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_chunking.py -v`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/audio/chunking.py backend/tests/test_chunking.py
git commit -m "feat: decoupage d'un flux de tokens en phrases prononcables"
```

---

### Task 6 : Client Ollama en streaming

**Files:**
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/ollama.py`
- Test: `backend/tests/test_ollama.py`

**Interfaces:**
- Consumes: `app.config.Settings` (tâche 1)
- Produces: `Message` (TypedDict : `role: str`, `content: str`) ; `LlmClient` (Protocol avec `stream_chat(messages: list[Message]) -> AsyncIterator[str]`) ; `OllamaClient(base_url, model, timeout_s)` ; `FakeLlmClient(reponses: list[str])` qui émet chaque réponse mot à mot et expose `derniers_messages: list[Message]`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_ollama.py
import json

import httpx
import pytest

from app.llm.ollama import FakeLlmClient, OllamaClient

async def _collecter(client, messages):
    return [m async for m in client.stream_chat(messages)]

async def test_fake_emet_mot_a_mot():
    fake = FakeLlmClient(["bonjour tout le monde"])
    assert await _collecter(fake, [{"role": "user", "content": "x"}]) == [
        "bonjour ", "tout ", "le ", "monde",
    ]

async def test_fake_memorise_les_messages_recus():
    fake = FakeLlmClient(["ok"])
    messages = [{"role": "user", "content": "contexte prospect"}]
    await _collecter(fake, messages)
    assert fake.derniers_messages == messages

async def test_ollama_agrege_les_lignes_ndjson():
    lignes = [
        json.dumps({"message": {"content": "Bon"}, "done": False}),
        json.dumps({"message": {"content": "jour"}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": True}),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, text="\n".join(lignes))

    transport = httpx.MockTransport(handler)
    client = OllamaClient("http://x", "modele", transport=transport)
    assert await _collecter(client, [{"role": "user", "content": "salut"}]) == ["Bon", "jour"]

async def test_ollama_ignore_les_lignes_vides():
    lignes = [json.dumps({"message": {"content": "A"}, "done": False}), "", "  "]
    transport = httpx.MockTransport(lambda r: httpx.Response(200, text="\n".join(lignes)))
    client = OllamaClient("http://x", "modele", transport=transport)
    assert await _collecter(client, [{"role": "user", "content": "s"}]) == ["A"]

async def test_ollama_leve_une_erreur_explicite_si_service_absent():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refus", request=request)

    transport = httpx.MockTransport(handler)
    client = OllamaClient("http://x", "modele", transport=transport)
    with pytest.raises(RuntimeError, match="Ollama"):
        await _collecter(client, [{"role": "user", "content": "s"}])
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_ollama.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.llm'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/llm/ollama.py
import json
from collections.abc import AsyncIterator
from typing import Protocol, TypedDict

import httpx

class Message(TypedDict):
    role: str
    content: str

class LlmClient(Protocol):
    def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]: ...

class OllamaClient:
    def __init__(
        self, base_url: str, model: str, timeout_s: float = 120.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self._transport = transport

    async def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]:
        charge = {"model": self.model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_s, transport=self._transport
            ) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=charge
                ) as reponse:
                    reponse.raise_for_status()
                    async for ligne in reponse.aiter_lines():
                        if not ligne.strip():
                            continue
                        bloc = json.loads(ligne)
                        morceau = bloc.get("message", {}).get("content", "")
                        if morceau:
                            yield morceau
                        if bloc.get("done"):
                            return
        except httpx.HTTPError as err:
            raise RuntimeError(
                f"Ollama est injoignable sur {self.base_url}. "
                f"Lancez-le avec : ollama serve"
            ) from err

class FakeLlmClient:
    def __init__(self, reponses: list[str]) -> None:
        self._reponses = list(reponses)
        self.derniers_messages: list[Message] = []

    async def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]:
        self.derniers_messages = messages
        texte = self._reponses.pop(0) if self._reponses else ""
        mots = texte.split(" ")
        for i, mot in enumerate(mots):
            yield mot if i == len(mots) - 1 else mot + " "
```

Créer aussi `backend/app/llm/__init__.py` vide.

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_ollama.py -v`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/ backend/tests/test_ollama.py
git commit -m "feat: client Ollama en streaming avec doublure de test"
```

---

### Task 7 : Brief prospect et génération du script

**Files:**
- Create: `backend/app/meeting/__init__.py`
- Create: `backend/app/meeting/brief.py`
- Create: `backend/app/meeting/script.py`
- Test: `backend/tests/test_brief.py`
- Test: `backend/tests/test_script.py`

**Interfaces:**
- Consumes: `LlmClient`, `FakeLlmClient` (tâche 6)
- Produces: `MeetingBrief` (modèle Pydantic) ; `ScriptBlock` (`kind: str`, `text: str`) ; `Script` (`blocks: list[ScriptBlock]`) ; `KINDS: tuple[str, ...]` valant `("accroche", "probleme", "solution", "preuve", "next_step")` ; `build_script_messages(brief) -> list[Message]` ; `parse_script(texte) -> Script` ; `generate_script(llm, brief) -> Script` (coroutine).

- [ ] **Step 1: Écrire les tests du brief (ils doivent échouer)**

```python
# backend/tests/test_brief.py
import pytest
from pydantic import ValidationError

from app.meeting.brief import MeetingBrief

VALIDE = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts de traitement des factures",
    "goal": "Obtenir un second rendez-vous technique",
    "expected_objections": ["Le prix", "Le delai de deploiement"],
    "tone": "direct et chiffre",
    "target_duration_min": 10,
}

def test_brief_valide_est_accepte():
    assert MeetingBrief(**VALIDE).company == "Acme SA"

def test_objections_par_defaut_vides():
    donnees = {k: v for k, v in VALIDE.items() if k != "expected_objections"}
    assert MeetingBrief(**donnees).expected_objections == []

def test_nom_de_prospect_vide_est_refuse():
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "prospect_name": "   "})

def test_objectif_obligatoire():
    donnees = {k: v for k, v in VALIDE.items() if k != "goal"}
    with pytest.raises(ValidationError):
        MeetingBrief(**donnees)

def test_duree_hors_bornes_est_refusee():
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "target_duration_min": 0})
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "target_duration_min": 61})

def test_espaces_superflus_sont_retires():
    assert MeetingBrief(**{**VALIDE, "company": "  Acme SA  "}).company == "Acme SA"
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_brief.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.meeting'`

- [ ] **Step 3: Écrire le modèle de brief**

```python
# backend/app/meeting/brief.py
from pydantic import BaseModel, Field, field_validator

class MeetingBrief(BaseModel):
    prospect_name: str = Field(min_length=1, max_length=120)
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=160)
    stake: str = Field(min_length=1, max_length=2000)
    goal: str = Field(min_length=1, max_length=2000)
    expected_objections: list[str] = Field(default_factory=list)
    tone: str = Field(default="professionnel et direct", max_length=200)
    target_duration_min: int = Field(default=10, ge=1, le=60)

    @field_validator("role", "tone")
    @classmethod
    def _nettoyer(cls, v: str) -> str:
        return v.strip()

    @field_validator("prospect_name", "company", "stake", "goal")
    @classmethod
    def _non_vide(cls, v: str) -> str:
        nettoye = v.strip()
        if not nettoye:
            raise ValueError("Ce champ ne peut pas etre vide.")
        return nettoye
```

- [ ] **Step 4: Lancer et vérifier le succès du brief**

Run: `cd backend && pytest tests/test_brief.py -v`
Expected: PASS, 6 tests

- [ ] **Step 5: Écrire les tests du script (ils doivent échouer)**

```python
# backend/tests/test_script.py
import pytest

from app.llm.ollama import FakeLlmClient
from app.meeting.brief import MeetingBrief
from app.meeting.script import KINDS, build_script_messages, generate_script, parse_script

BRIEF = MeetingBrief(
    prospect_name="Claire Martin",
    company="Acme SA",
    role="Directrice des achats",
    stake="Reduire les couts de traitement des factures",
    goal="Obtenir un second rendez-vous technique",
    expected_objections=["Le prix"],
    tone="direct et chiffre",
    target_duration_min=10,
)

BRUT = """[accroche]
Bonjour Claire, merci de votre temps.
[probleme]
Vos factures coutent cher a traiter.
[solution]
Notre outil automatise la saisie.
[preuve]
Un client a divise son delai par quatre.
[next_step]
On se cale un point technique ?"""

def test_le_prompt_contient_les_elements_du_brief():
    messages = build_script_messages(BRIEF)
    corps = " ".join(m["content"] for m in messages)
    assert "Claire Martin" in corps
    assert "Acme SA" in corps
    assert "Le prix" in corps
    assert "10" in corps

def test_le_prompt_impose_le_francais():
    corps = " ".join(m["content"] for m in build_script_messages(BRIEF))
    assert "francais" in corps.lower()

def test_parse_extrait_les_cinq_blocs():
    script = parse_script(BRUT)
    assert [b.kind for b in script.blocks] == list(KINDS)

def test_parse_conserve_le_texte():
    script = parse_script(BRUT)
    assert script.blocks[0].text == "Bonjour Claire, merci de votre temps."

def test_parse_ignore_une_balise_inconnue():
    script = parse_script("[inventee]\nTexte.\n[accroche]\nBonjour.")
    assert [b.kind for b in script.blocks] == ["accroche"]

def test_parse_sans_aucune_balise_leve_une_erreur():
    with pytest.raises(ValueError, match="aucun bloc"):
        parse_script("Du texte sans la moindre balise.")

async def test_generate_script_assemble_le_flux():
    llm = FakeLlmClient([BRUT])
    script = await generate_script(llm, BRIEF)
    assert len(script.blocks) == 5
    assert script.blocks[4].kind == "next_step"
```

- [ ] **Step 6: Lancer et vérifier l'échec du script**

Run: `cd backend && pytest tests/test_script.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.meeting.script'`

- [ ] **Step 7: Écrire la génération de script**

```python
# backend/app/meeting/script.py
import re

from pydantic import BaseModel

from app.llm.ollama import LlmClient, Message
from app.meeting.brief import MeetingBrief

KINDS: tuple[str, ...] = ("accroche", "probleme", "solution", "preuve", "next_step")
_BALISE = re.compile(r"^\[([a-z_]+)\]\s*$", re.MULTILINE)

class ScriptBlock(BaseModel):
    kind: str
    text: str

class Script(BaseModel):
    blocks: list[ScriptBlock]

    def as_plain_text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)

_SYSTEME = (
    "Tu rediges le script oral d'un commercial pour un rendez-vous de prospection. "
    "Tu ecris exclusivement en francais, dans un style parle et naturel, destine a "
    "etre prononce a voix haute. Pas de listes a puces, pas de titres, pas de "
    "markdown : uniquement des phrases que l'on peut dire. "
    f"Structure ta reponse en exactement cinq blocs, dans cet ordre : "
    + " ".join(f"[{k}]" for k in KINDS)
    + ". Fais preceder chaque bloc de sa balise seule sur sa ligne."
)

def build_script_messages(brief: MeetingBrief) -> list[Message]:
    objections = ", ".join(brief.expected_objections) or "aucune identifiee"
    utilisateur = (
        f"Prospect : {brief.prospect_name}, {brief.role or 'fonction non precisee'} "
        f"chez {brief.company}.\n"
        f"Enjeu du prospect : {brief.stake}\n"
        f"Objectif du rendez-vous : {brief.goal}\n"
        f"Objections attendues : {objections}\n"
        f"Ton souhaite : {brief.tone}\n"
        f"Duree cible : {brief.target_duration_min} minutes."
    )
    return [
        {"role": "system", "content": _SYSTEME},
        {"role": "user", "content": utilisateur},
    ]

def parse_script(brut: str) -> Script:
    morceaux = _BALISE.split(brut)
    blocks: list[ScriptBlock] = []
    for i in range(1, len(morceaux) - 1, 2):
        kind = morceaux[i].strip()
        texte = morceaux[i + 1].strip()
        if kind in KINDS and texte:
            blocks.append(ScriptBlock(kind=kind, text=texte))
    if not blocks:
        raise ValueError(
            "Le modele n'a produit aucun bloc exploitable. Relancez la generation."
        )
    return Script(blocks=blocks)

async def generate_script(llm: LlmClient, brief: MeetingBrief) -> Script:
    morceaux: list[str] = []
    async for morceau in llm.stream_chat(build_script_messages(brief)):
        morceaux.append(morceau)
    return parse_script("".join(morceaux))
```

Créer aussi `backend/app/meeting/__init__.py` vide.

- [ ] **Step 8: Lancer et vérifier le succès du script**

Run: `cd backend && pytest tests/test_script.py -v`
Expected: PASS, 7 tests

- [ ] **Step 9: Commit**

```bash
git add backend/app/meeting/ backend/tests/test_brief.py backend/tests/test_script.py
git commit -m "feat: modele de brief prospect et generation du script"
```

---

### Task 8 : Moteur de synthèse vocale

**Files:**
- Create: `backend/app/voice/engine.py`
- Test: `backend/tests/test_engine.py`

**Interfaces:**
- Consumes: `VoiceProfile` (tâche 4)
- Produces: `TtsEngine` (Protocol avec `synthesize(text: str, profile: VoiceProfile) -> bytes`, renvoyant du WAV) ; `FakeTtsEngine` qui expose `appels: list[tuple[str, str]]` (texte, id du profil) ; `ChatterboxEngine(device: str = "cuda")` ; `get_engine(nom: str) -> TtsEngine`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_engine.py
import io
import wave

import pytest

from app.voice.engine import FakeTtsEngine, get_engine
from app.voice.store import VoiceProfile

PROFIL = VoiceProfile(
    id="abc", label="Ma voix", created_at="2026-09-11T00:00:00+00:00",
    sample_path="/tmp/abc.wav", duration_s=45.0, snr_db=30.0,
    peak_dbfs=-6.0, engine="chatterbox",
)

def test_fake_produit_un_wav_lisible():
    audio = FakeTtsEngine().synthesize("Bonjour Claire.", PROFIL)
    with wave.open(io.BytesIO(audio)) as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 24000
        assert w.getnframes() > 0

def test_fake_memorise_les_appels():
    moteur = FakeTtsEngine()
    moteur.synthesize("Une phrase.", PROFIL)
    moteur.synthesize("Une autre.", PROFIL)
    assert moteur.appels == [("Une phrase.", "abc"), ("Une autre.", "abc")]

def test_duree_croit_avec_la_longueur_du_texte():
    moteur = FakeTtsEngine()
    court = moteur.synthesize("Court.", PROFIL)
    long = moteur.synthesize("Un texte nettement plus long que le precedent.", PROFIL)
    assert len(long) > len(court)

def test_texte_vide_est_refuse():
    with pytest.raises(ValueError, match="vide"):
        FakeTtsEngine().synthesize("   ", PROFIL)

def test_get_engine_fake():
    assert isinstance(get_engine("fake"), FakeTtsEngine)

def test_get_engine_inconnu_est_refuse():
    with pytest.raises(ValueError, match="inconnu"):
        get_engine("inexistant")
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_engine.py -v`
Expected: FAIL avec `ImportError: cannot import name 'FakeTtsEngine'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/voice/engine.py
import io
import wave
from typing import Protocol

import numpy as np

from app.voice.store import VoiceProfile

SAMPLE_RATE = 24000

class TtsEngine(Protocol):
    def synthesize(self, text: str, profile: VoiceProfile) -> bytes: ...

def _to_wav(signal: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    pcm = np.clip(signal, -1.0, 1.0)
    pcm = (pcm * 32767).astype(np.int16)
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return tampon.getvalue()

class FakeTtsEngine:
    """Doublure : produit un WAV silencieux proportionnel au texte. Sans GPU."""

    def __init__(self) -> None:
        self.appels: list[tuple[str, str]] = []

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte a synthetiser est vide.")
        self.appels.append((text, profile.id))
        duree = max(0.3, len(text) * 0.06)
        return _to_wav(np.zeros(int(duree * SAMPLE_RATE), dtype=np.float32))

class ChatterboxEngine:
    """Moteur reel. Charge le modele paresseusement : l'import coute cher."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._modele = None

    def _charger(self):
        if self._modele is None:
            from chatterbox.tts import ChatterboxTTS  # import tardif volontaire

            self._modele = ChatterboxTTS.from_pretrained(device=self.device)
        return self._modele

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte a synthetiser est vide.")
        modele = self._charger()
        onde = modele.generate(text, audio_prompt_path=profile.sample_path)
        signal = np.asarray(onde).squeeze().astype(np.float32)
        return _to_wav(signal, sr=getattr(modele, "sr", SAMPLE_RATE))

def get_engine(nom: str) -> TtsEngine:
    if nom == "fake":
        return FakeTtsEngine()
    if nom == "chatterbox":
        return ChatterboxEngine()
    raise ValueError(f"Moteur TTS inconnu : {nom!r}")
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_engine.py -v`
Expected: PASS, 6 tests

- [ ] **Step 5: Vérification manuelle sur GPU (à faire sur la machine à carte NVIDIA)**

Ajouter `chatterbox-tts` aux dépendances, puis vérifier que l'API réelle correspond :

```bash
cd backend && python -c "
from chatterbox.tts import ChatterboxTTS
m = ChatterboxTTS.from_pretrained(device='cuda')
print('sample rate:', m.sr)
print('signature generate:', m.generate.__doc__)
"
```

Si la signature diffère de `generate(text, audio_prompt_path=...)`, corriger `ChatterboxEngine.synthesize` **sans toucher au Protocol** ni aux tests : c'est précisément ce que la frontière protège.

- [ ] **Step 6: Commit**

```bash
git add backend/app/voice/engine.py backend/tests/test_engine.py backend/pyproject.toml
git commit -m "feat: moteur de synthese vocale Chatterbox avec doublure"
```

---

### Task 9 : Transcription des questions

**Files:**
- Create: `backend/app/stt/__init__.py`
- Create: `backend/app/stt/transcriber.py`
- Test: `backend/tests/test_transcriber.py`

**Interfaces:**
- Consumes: rien
- Produces: `Transcriber` (Protocol avec `transcribe(wav_bytes: bytes) -> str`) ; `FakeTranscriber(reponses: list[str])` exposant `appels: int` ; `KyutaiTranscriber(device: str = "cuda")` ; `get_transcriber(nom: str) -> Transcriber`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_transcriber.py
import pytest

from app.stt.transcriber import FakeTranscriber, get_transcriber

def test_fake_rend_les_reponses_dans_l_ordre():
    t = FakeTranscriber(["Quel est le prix ?", "Et le delai ?"])
    assert t.transcribe(b"RIFF") == "Quel est le prix ?"
    assert t.transcribe(b"RIFF") == "Et le delai ?"

def test_fake_compte_les_appels():
    t = FakeTranscriber(["a", "b"])
    t.transcribe(b"x")
    assert t.appels == 1

def test_fake_epuise_rend_une_chaine_vide():
    t = FakeTranscriber(["seule"])
    t.transcribe(b"x")
    assert t.transcribe(b"x") == ""

def test_audio_vide_est_refuse():
    with pytest.raises(ValueError, match="vide"):
        FakeTranscriber(["a"]).transcribe(b"")

def test_get_transcriber_inconnu_est_refuse():
    with pytest.raises(ValueError, match="inconnu"):
        get_transcriber("inexistant")
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_transcriber.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.stt'`

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/stt/transcriber.py
import io
import tempfile
from pathlib import Path
from typing import Protocol

MODELE_KYUTAI = "kyutai/stt-1b-en_fr"

class Transcriber(Protocol):
    def transcribe(self, wav_bytes: bytes) -> str: ...

class FakeTranscriber:
    def __init__(self, reponses: list[str]) -> None:
        self._reponses = list(reponses)
        self.appels = 0

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio recu est vide.")
        self.appels += 1
        return self._reponses.pop(0) if self._reponses else ""

class KyutaiTranscriber:
    """STT Kyutai en process, par lot. Le tour par tour rend le streaming inutile."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._modele = None

    def _charger(self):
        if self._modele is None:
            from moshi.models import loaders  # import tardif volontaire

            self._modele = loaders.get_stt_model(MODELE_KYUTAI, device=self.device)
        return self._modele

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio recu est vide.")
        modele = self._charger()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            chemin = Path(f.name)
        try:
            return str(modele.transcribe_file(str(chemin))).strip()
        finally:
            chemin.unlink(missing_ok=True)

def get_transcriber(nom: str) -> Transcriber:
    if nom == "fake":
        return FakeTranscriber([])
    if nom == "kyutai":
        return KyutaiTranscriber()
    raise ValueError(f"Moteur de transcription inconnu : {nom!r}")
```

Créer aussi `backend/app/stt/__init__.py` vide.

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_transcriber.py -v`
Expected: PASS, 5 tests

- [ ] **Step 5: Vérification manuelle sur GPU (à faire sur la machine à carte NVIDIA)**

Ajouter `moshi` aux dépendances, puis :

```bash
cd backend && python -c "
from moshi.models import loaders
print([n for n in dir(loaders) if 'stt' in n.lower()])
"
```

L'API exacte de chargement et de transcription doit être confirmée contre la version installée. Corriger `KyutaiTranscriber._charger` et `.transcribe` **sans toucher au Protocol** ni aux tests. Si l'API par lot n'existe pas dans la version installée, se rabattre sur le binaire `moshi-server` en conteneur (spec §3) : seul ce fichier change.

- [ ] **Step 6: Commit**

```bash
git add backend/app/stt/ backend/tests/test_transcriber.py backend/pyproject.toml
git commit -m "feat: transcription Kyutai par lot avec doublure"
```

---

### Task 10 : Routes REST voix et réunion

**Files:**
- Create: `backend/app/routes/voice.py`
- Create: `backend/app/routes/meeting.py`
- Create: `backend/app/deps.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_routes_voice.py`
- Test: `backend/tests/test_routes_meeting.py`

**Interfaces:**
- Consumes: `analyze`, `validate` (tâche 3) ; `VoiceStore`, `VoiceProfile` (tâche 4) ; `FakeLlmClient` (tâche 6) ; `generate_script`, `MeetingBrief` (tâche 7) ; `TtsEngine`, `FakeTtsEngine` (tâche 8)
- Produces: `app.deps.get_store()`, `get_llm()`, `get_tts()`, `get_transcriber_dep()` (surchargeables via `app.dependency_overrides`) ; routes `POST /api/voice/analyze`, `POST /api/voice/profiles`, `GET /api/voice/profiles`, `DELETE /api/voice/profiles/{id}`, `POST /api/voice/profiles/{id}/preview`, `POST /api/meeting/script`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_routes_voice.py
import io

import numpy as np
import soundfile as sf

SR = 24000

def _wav(duree_s=45.0, amplitude=0.3):
    n = int(duree_s * SR)
    rng = np.random.default_rng(0)
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / SR)
    tampon = io.BytesIO()
    sf.write(tampon, (rng.normal(0, amplitude, n) * env).astype(np.float32), SR, format="WAV")
    return tampon.getvalue()

def test_analyze_accepte_un_bon_echantillon(client):
    r = client.post("/api/voice/analyze", files={"file": ("e.wav", _wav(), "audio/wav")})
    assert r.status_code == 200
    assert r.json()["ok"] is True

def test_analyze_refuse_un_echantillon_trop_court(client):
    r = client.post("/api/voice/analyze", files={"file": ("e.wav", _wav(5.0), "audio/wav")})
    assert r.json()["ok"] is False
    assert r.json()["problems"]

def test_creation_puis_lecture_du_profil(client):
    r = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", _wav(), "audio/wav")},
        data={"label": "Ma voix"},
    )
    assert r.status_code == 201
    profil_id = r.json()["id"]
    assert any(p["id"] == profil_id for p in client.get("/api/voice/profiles").json())

def test_creation_refusee_si_echantillon_invalide(client):
    r = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", _wav(5.0), "audio/wav")},
        data={"label": "Ma voix"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["problems"]

def test_preview_renvoie_du_wav(client):
    profil_id = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", _wav(), "audio/wav")},
        data={"label": "Ma voix"},
    ).json()["id"]
    r = client.post(
        f"/api/voice/profiles/{profil_id}/preview",
        json={"text": "Bonjour, ceci est un essai de ma voix clonee."},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.content[:4] == b"RIFF"

def test_suppression_du_profil(client):
    profil_id = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", _wav(), "audio/wav")},
        data={"label": "Ma voix"},
    ).json()["id"]
    assert client.delete(f"/api/voice/profiles/{profil_id}").status_code == 204
    assert client.get("/api/voice/profiles").json() == []

def test_suppression_inconnue_renvoie_404(client):
    assert client.delete("/api/voice/profiles/inexistant").status_code == 404
```

```python
# backend/tests/test_routes_meeting.py
BRIEF = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts de traitement des factures",
    "goal": "Obtenir un second rendez-vous technique",
    "expected_objections": ["Le prix"],
    "tone": "direct et chiffre",
    "target_duration_min": 10,
}

def test_generation_de_script(client):
    r = client.post("/api/meeting/script", json=BRIEF)
    assert r.status_code == 200
    assert [b["kind"] for b in r.json()["blocks"]] == [
        "accroche", "probleme", "solution", "preuve", "next_step",
    ]

def test_brief_invalide_renvoie_422(client):
    r = client.post("/api/meeting/script", json={**BRIEF, "prospect_name": ""})
    assert r.status_code == 422
```

Étendre `backend/tests/conftest.py` — remplacer intégralement son contenu :

```python
# backend/tests/conftest.py
import pytest
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
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_routes_voice.py tests/test_routes_meeting.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'app.deps'`

- [ ] **Step 3: Écrire les dépendances injectables**

```python
# backend/app/deps.py
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
    tier = select_tier(detect_vram_gb())
    return OllamaClient(settings.ollama_url, tier.llm_model, settings.ollama_timeout_s)

@lru_cache
def _tts() -> TtsEngine:
    return get_engine("chatterbox")

@lru_cache
def _stt() -> Transcriber:
    return get_transcriber("kyutai")

def get_store() -> VoiceStore:
    return _store()

def get_llm() -> LlmClient:
    return _llm()

def get_tts() -> TtsEngine:
    return _tts()

def get_transcriber_dep() -> Transcriber:
    return _stt()
```

- [ ] **Step 4: Écrire les routes voix**

```python
# backend/app/routes/voice.py
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app.audio.validation import analyze, validate
from app.deps import get_store, get_tts
from app.voice.engine import TtsEngine
from app.voice.store import VoiceStore

router = APIRouter(prefix="/api/voice", tags=["voice"])

class PreviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)

def _analyser(contenu: bytes):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(contenu)
        chemin = Path(f.name)
    try:
        return analyze(chemin)
    finally:
        chemin.unlink(missing_ok=True)

@router.post("/analyze")
async def analyser(file: UploadFile = File(...)) -> dict:
    metriques = _analyser(await file.read())
    resultat = validate(metriques)
    return {"ok": resultat.ok, "problems": resultat.problems, "metrics": metriques.__dict__}

@router.post("/profiles", status_code=201)
async def creer(
    file: UploadFile = File(...),
    label: str = Form(...),
    store: VoiceStore = Depends(get_store),
) -> dict:
    contenu = await file.read()
    metriques = _analyser(contenu)
    resultat = validate(metriques)
    if not resultat.ok:
        raise HTTPException(422, detail={"problems": resultat.problems})
    return store.create(label, contenu, metriques).__dict__

@router.get("/profiles")
def lister(store: VoiceStore = Depends(get_store)) -> list[dict]:
    return [p.__dict__ for p in store.list()]

@router.delete("/profiles/{profil_id}", status_code=204)
def supprimer(profil_id: str, store: VoiceStore = Depends(get_store)) -> Response:
    if not store.delete(profil_id):
        raise HTTPException(404, detail="Profil vocal introuvable.")
    return Response(status_code=204)

@router.post("/profiles/{profil_id}/preview")
def previsualiser(
    profil_id: str,
    requete: PreviewRequest,
    store: VoiceStore = Depends(get_store),
    tts: TtsEngine = Depends(get_tts),
) -> Response:
    profil = store.get(profil_id)
    if profil is None:
        raise HTTPException(404, detail="Profil vocal introuvable.")
    return Response(content=tts.synthesize(requete.text, profil), media_type="audio/wav")
```

- [ ] **Step 5: Écrire la route réunion**

```python
# backend/app/routes/meeting.py
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_llm
from app.llm.ollama import LlmClient
from app.meeting.brief import MeetingBrief
from app.meeting.script import Script, generate_script

router = APIRouter(prefix="/api/meeting", tags=["meeting"])

@router.post("/script")
async def creer_script(
    brief: MeetingBrief, llm: LlmClient = Depends(get_llm)
) -> Script:
    try:
        return await generate_script(llm, brief)
    except ValueError as err:
        raise HTTPException(422, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(503, detail=str(err)) from err
```

- [ ] **Step 6: Monter les routes**

Dans `backend/app/main.py`, remplacer la ligne `from app.routes import health` par :

```python
from app.routes import health, meeting, voice
```

et ajouter après `app.include_router(health.router)` :

```python
app.include_router(voice.router)
app.include_router(meeting.router)
```

- [ ] **Step 7: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_routes_voice.py tests/test_routes_meeting.py -v`
Expected: PASS, 9 tests

- [ ] **Step 8: Commit**

```bash
git add backend/app/deps.py backend/app/routes/ backend/app/main.py backend/tests/
git commit -m "feat: routes REST voix et generation de script"
```

---

### Task 11 : WebSocket de la boucle question/réponse

C'est ici que la cible de 1 à 2 s se gagne ou se perd.

**Files:**
- Create: `backend/app/routes/qa.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_routes_qa.py`

**Interfaces:**
- Consumes: `SentenceChunker` (tâche 5) ; `LlmClient` (tâche 6) ; `Script`, `MeetingBrief` (tâche 7) ; `TtsEngine` (tâche 8) ; `Transcriber` (tâche 9) ; `VoiceStore` (tâche 4) ; dépendances de `app.deps` (tâche 10)
- Produces: `WS /api/qa/{profil_id}`. Messages entrants : `{"type": "context", "brief": {...}, "script": {...}}` puis `{"type": "question", "text": "..."}` ou `{"type": "audio", "wav_b64": "..."}`. Messages sortants, dans l'ordre : `{"type": "question", "text": ...}`, puis N paires `{"type": "sentence", "text": ...}` + `{"type": "audio", "wav_b64": ...}`, puis `{"type": "done"}`. En cas d'incident : `{"type": "error", "message": ...}`.
- Produces également : `build_answer_messages(brief, script, historique, question) -> list[Message]`.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```python
# backend/tests/test_routes_qa.py
import base64

BRIEF = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts",
    "goal": "Second rendez-vous",
    "expected_objections": ["Le prix"],
    "tone": "direct",
    "target_duration_min": 10,
}
SCRIPT = {"blocks": [{"kind": "accroche", "text": "Bonjour Claire."}]}

def _ouvrir(client, profil_id):
    ws = client.websocket_connect(f"/api/qa/{profil_id}").__enter__()
    ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
    return ws

def _profil(client, wav):
    return client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", wav, "audio/wav")},
        data={"label": "Ma voix"},
    ).json()["id"]

def test_question_texte_produit_phrases_puis_audio_puis_done(client, wav_valide):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        types = []
        while True:
            message = ws.receive_json()
            types.append(message["type"])
            if message["type"] == "done":
                break
        assert types[0] == "question"
        assert "sentence" in types
        assert "audio" in types
        assert types.index("sentence") < types.index("audio")

def test_chaque_audio_est_du_wav_valide(client, wav_valide):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while True:
            message = ws.receive_json()
            if message["type"] == "audio":
                assert base64.b64decode(message["wav_b64"])[:4] == b"RIFF"
            if message["type"] == "done":
                break

def test_question_audio_est_transcrite_et_renvoyee(client, wav_valide):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json(
            {"type": "audio", "wav_b64": base64.b64encode(b"RIFFfake").decode()}
        )
        message = ws.receive_json()
        assert message == {"type": "question", "text": "Quel est le prix ?"}

def test_profil_inconnu_renvoie_une_erreur(client):
    with client.websocket_connect("/api/qa/inexistant") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        message = ws.receive_json()
        assert message["type"] == "error"
        assert "introuvable" in message["message"].lower()

def test_question_avant_contexte_renvoie_une_erreur(client, wav_valide):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        assert ws.receive_json()["type"] == "error"

def test_le_prompt_contient_le_brief_et_le_script(client, wav_valide, llm_espion):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass
    corps = " ".join(m["content"] for m in llm_espion.derniers_messages)
    assert "Claire Martin" in corps
    assert "Bonjour Claire." in corps
    assert "Quel est le prix ?" in corps
```

Ajouter ces deux fixtures à `backend/tests/conftest.py` :

```python
import io

import numpy as np
import soundfile as sf

@pytest.fixture
def wav_valide():
    sr, duree = 24000, 45.0
    n = int(duree * sr)
    rng = np.random.default_rng(0)
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / sr)
    tampon = io.BytesIO()
    sf.write(tampon, (rng.normal(0, 0.3, n) * env).astype(np.float32), sr, format="WAV")
    return tampon.getvalue()

@pytest.fixture
def llm_espion(client):
    """Le FakeLlmClient injecte par la fixture client, pour inspecter les prompts."""
    return app.dependency_overrides[deps.get_llm]()
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd backend && pytest tests/test_routes_qa.py -v`
Expected: FAIL avec `404` sur la connexion WebSocket (route absente)

- [ ] **Step 3: Écrire l'implémentation**

```python
# backend/app/routes/qa.py
import base64

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.audio.chunking import SentenceChunker
from app.deps import get_llm, get_store, get_transcriber_dep, get_tts
from app.llm.ollama import LlmClient, Message
from app.meeting.brief import MeetingBrief
from app.meeting.script import Script
from app.stt.transcriber import Transcriber
from app.voice.engine import TtsEngine
from app.voice.store import VoiceStore

router = APIRouter(prefix="/api/qa", tags=["qa"])

_SYSTEME = (
    "Tu reponds a la place d'un commercial, en francais, a l'oral. "
    "Tes reponses sont courtes : deux a quatre phrases maximum, faites pour etre "
    "prononcees. Pas de listes, pas de markdown. Tu restes strictement coherent avec "
    "le script de presentation deja delivre. Si une question porte sur un prix ferme "
    "ou un engagement contractuel que le contexte ne precise pas, tu ne l'inventes "
    "jamais : tu proposes d'y revenir precisement apres verification."
)

def build_answer_messages(
    brief: MeetingBrief, script: Script, historique: list[Message], question: str
) -> list[Message]:
    contexte = (
        f"Prospect : {brief.prospect_name}, {brief.role or 'fonction non precisee'} "
        f"chez {brief.company}.\n"
        f"Enjeu : {brief.stake}\n"
        f"Objectif du rendez-vous : {brief.goal}\n\n"
        f"Script deja presente :\n{script.as_plain_text()}"
    )
    return [
        {"role": "system", "content": _SYSTEME},
        {"role": "system", "content": contexte},
        *historique,
        {"role": "user", "content": question},
    ]

@router.websocket("/{profil_id}")
async def boucle_qa(
    websocket: WebSocket,
    profil_id: str,
    store: VoiceStore = Depends(get_store),
    llm: LlmClient = Depends(get_llm),
    tts: TtsEngine = Depends(get_tts),
    stt: Transcriber = Depends(get_transcriber_dep),
) -> None:
    await websocket.accept()
    brief: MeetingBrief | None = None
    script: Script | None = None
    historique: list[Message] = []

    profil = store.get(profil_id)

    try:
        while True:
            entrant = await websocket.receive_json()
            type_message = entrant.get("type")

            if type_message == "context":
                if profil is None:
                    await websocket.send_json(
                        {"type": "error", "message": "Profil vocal introuvable."}
                    )
                    continue
                brief = MeetingBrief(**entrant["brief"])
                script = Script(**entrant["script"])
                continue

            if type_message in ("question", "audio"):
                if brief is None or script is None or profil is None:
                    await websocket.send_json(
                        {"type": "error", "message": "Contexte de reunion non initialise."}
                    )
                    continue

                if type_message == "audio":
                    question = stt.transcribe(base64.b64decode(entrant["wav_b64"]))
                else:
                    question = entrant["text"]

                await websocket.send_json({"type": "question", "text": question})

                chunker = SentenceChunker()
                reponse_complete: list[str] = []

                async def emettre(phrase: str) -> None:
                    reponse_complete.append(phrase)
                    await websocket.send_json({"type": "sentence", "text": phrase})
                    audio = tts.synthesize(phrase, profil)
                    await websocket.send_json(
                        {"type": "audio", "wav_b64": base64.b64encode(audio).decode()}
                    )

                messages = build_answer_messages(brief, script, historique, question)
                try:
                    async for morceau in llm.stream_chat(messages):
                        for phrase in chunker.feed(morceau):
                            await emettre(phrase)
                    reste = chunker.flush()
                    if reste:
                        await emettre(reste)
                except RuntimeError as err:
                    await websocket.send_json({"type": "error", "message": str(err)})
                    continue

                historique.append({"role": "user", "content": question})
                historique.append({"role": "assistant", "content": " ".join(reponse_complete)})
                await websocket.send_json({"type": "done"})
                continue

            await websocket.send_json(
                {"type": "error", "message": f"Type de message inconnu : {type_message!r}"}
            )
    except WebSocketDisconnect:
        return
```

- [ ] **Step 4: Monter la route**

Dans `backend/app/main.py`, étendre l'import en `from app.routes import health, meeting, qa, voice` et ajouter `app.include_router(qa.router)`.

- [ ] **Step 5: Lancer et vérifier le succès**

Run: `cd backend && pytest tests/test_routes_qa.py -v`
Expected: PASS, 6 tests

- [ ] **Step 6: Lancer toute la suite**

Run: `cd backend && pytest -v`
Expected: PASS, 65 tests environ, aucun GPU requis

- [ ] **Step 7: Commit**

```bash
git add backend/app/routes/qa.py backend/app/main.py backend/tests/
git commit -m "feat: boucle question/reponse en streaming par WebSocket"
```

---

### Task 12 : Test de non-régression sur la confidentialité

L'auto-hébergement est motivé par la confidentialité : il faut le prouver, pas l'affirmer.

**Files:**
- Test: `backend/tests/test_confidentialite.py`

**Interfaces:**
- Consumes: toutes les routes des tâches 10 et 11
- Produces: rien

- [ ] **Step 1: Écrire le test**

```python
# backend/tests/test_confidentialite.py
"""Verifie qu'aucune requete ne part vers un hote externe pendant une session."""
import socket

import pytest

HOTES_LOCAUX = {"127.0.0.1", "::1", "localhost"}

BRIEF = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts",
    "goal": "Second rendez-vous",
    "expected_objections": ["Le prix"],
    "tone": "direct",
    "target_duration_min": 10,
}
SCRIPT = {"blocks": [{"kind": "accroche", "text": "Bonjour Claire."}]}

@pytest.fixture
def sorties_reseau(monkeypatch):
    """Intercepte toute connexion TCP et memorise les hotes non locaux."""
    vues: list[str] = []
    connect_reel = socket.socket.connect

    def connect_espion(self, adresse):
        if isinstance(adresse, tuple) and adresse:
            hote = str(adresse[0])
            if hote not in HOTES_LOCAUX:
                vues.append(hote)
        return connect_reel(self, adresse)

    monkeypatch.setattr(socket.socket, "connect", connect_espion)
    return vues

def test_aucune_sortie_reseau_pendant_une_session_complete(
    client, wav_valide, sorties_reseau
):
    profil_id = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", wav_valide, "audio/wav")},
        data={"label": "Ma voix"},
    ).json()["id"]

    client.post("/api/meeting/script", json=BRIEF)
    client.post(
        f"/api/voice/profiles/{profil_id}/preview",
        json={"text": "Bonjour, ceci est un essai de ma voix clonee."},
    )

    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass

    client.delete(f"/api/voice/profiles/{profil_id}")

    assert sorties_reseau == [], (
        f"Des connexions sont parties vers des hotes externes : {set(sorties_reseau)}. "
        "L'application doit fonctionner sans aucune sortie reseau."
    )
```

- [ ] **Step 2: Lancer et vérifier qu'il passe**

Run: `cd backend && pytest tests/test_confidentialite.py -v`
Expected: PASS. S'il échoue, un composant appelle l'extérieur : c'est un défaut bloquant, pas un test à assouplir.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_confidentialite.py
git commit -m "test: garantit l'absence de sortie reseau pendant une session"
```

---

### Task 13 : Socle frontend et écran d'accueil

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`
- Create: `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/app/page.tsx`
- Create: `frontend/lib/api.ts`
- Test: `frontend/lib/api.test.ts`

**Interfaces:**
- Consumes: routes REST de la tâche 10
- Produces: `lib/api.ts` exportant `analyzeSample(file: File)`, `createProfile(file: File, label: string)`, `listProfiles()`, `deleteProfile(id: string)`, `previewVoice(id: string, text: string)`, `generateScript(brief: Brief)`, et les types `Brief`, `VoiceProfile`, `Script`, `ScriptBlock`, `AnalyzeResult`.

- [ ] **Step 1: Créer le projet Next.js**

```bash
cd C:/Users/Kettei/Perso/Repo/buisness_vision
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm --yes
cd frontend && npm install --save-dev vitest @vitest/ui
npx shadcn@latest init -d
npx shadcn@latest add button card input textarea label progress alert
```

- [ ] **Step 2: Écrire le test du client API (il doit échouer)**

```typescript
// frontend/lib/api.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { analyzeSample, generateScript, listProfiles } from "./api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("client API", () => {
  it("envoie l'echantillon en multipart vers /api/voice/analyze", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, problems: [], metrics: {} }),
    });
    const fichier = new File([new Uint8Array([1, 2])], "e.wav", { type: "audio/wav" });
    const resultat = await analyzeSample(fichier);
    expect(resultat.ok).toBe(true);
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/api/voice/analyze");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("remonte un message clair quand le backend est injoignable", async () => {
    (fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listProfiles()).rejects.toThrow(/backend/i);
  });

  it("remonte le detail d'erreur du backend", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Brief invalide" }),
    });
    await expect(generateScript({} as any)).rejects.toThrow(/Brief invalide/);
  });
});
```

- [ ] **Step 3: Lancer et vérifier l'échec**

Run: `cd frontend && npx vitest run lib/api.test.ts`
Expected: FAIL — le module `./api` n'existe pas

- [ ] **Step 4: Écrire le client API**

```typescript
// frontend/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type VoiceProfile = {
  id: string; label: string; created_at: string; sample_path: string;
  duration_s: number; snr_db: number; peak_dbfs: number; engine: string;
};
export type AnalyzeResult = {
  ok: boolean;
  problems: string[];
  metrics: { duration_s: number; peak_dbfs: number; silence_ratio: number; snr_db: number };
};
export type Brief = {
  prospect_name: string; company: string; role: string; stake: string; goal: string;
  expected_objections: string[]; tone: string; target_duration_min: number;
};
export type ScriptBlock = { kind: string; text: string };
export type Script = { blocks: ScriptBlock[] };

async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, options);
  } catch {
    throw new Error(
      "Le backend est injoignable. Lancez-le avec : uvicorn app.main:app --port 8000"
    );
  }
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => ({}));
    const detail = corps.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.problems?.join(" ") ?? `Erreur ${reponse.status}`;
    throw new Error(message);
  }
  return reponse.json() as Promise<T>;
}

export async function analyzeSample(file: File): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append("file", file);
  return appeler<AnalyzeResult>("/api/voice/analyze", { method: "POST", body: form });
}

export async function createProfile(file: File, label: string): Promise<VoiceProfile> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  return appeler<VoiceProfile>("/api/voice/profiles", { method: "POST", body: form });
}

export async function listProfiles(): Promise<VoiceProfile[]> {
  return appeler<VoiceProfile[]>("/api/voice/profiles");
}

export async function deleteProfile(id: string): Promise<void> {
  await fetch(`${BASE}/api/voice/profiles/${id}`, { method: "DELETE" });
}

export async function previewVoice(id: string, text: string): Promise<Blob> {
  const reponse = await fetch(`${BASE}/api/voice/profiles/${id}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!reponse.ok) throw new Error("La previsualisation a echoue.");
  return reponse.blob();
}

export async function generateScript(brief: Brief): Promise<Script> {
  return appeler<Script>("/api/meeting/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
}

export function qaSocketUrl(profilId: string): string {
  return `${BASE.replace(/^http/, "ws")}/api/qa/${profilId}`;
}
```

- [ ] **Step 5: Lancer et vérifier le succès**

Run: `cd frontend && npx vitest run lib/api.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 6: Écrire l'écran d'accueil**

```tsx
// frontend/app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Votre voix, pour vos rendez-vous
        </h1>
        <p className="text-lg text-muted-foreground">
          Clonez votre voix une fois, décrivez votre prochain rendez-vous, et
          entraînez-vous à répondre aux questions de votre prospect.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Tout reste sur cette machine.</p>
        <p className="mt-1 text-muted-foreground">
          Votre voix, vos enregistrements et le contexte de vos prospects ne sont
          envoyés à aucun service externe. Aucune connexion sortante n&apos;est
          effectuée pendant l&apos;utilisation.
        </p>
      </div>

      <Button asChild size="lg" className="self-start">
        <Link href="/onboarding">Cloner ma voix</Link>
      </Button>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: socle frontend Next.js, client API et ecran d'accueil"
```

---

### Task 14 : Onboarding — test micro, enregistrement, contrôle qualité

**Files:**
- Create: `frontend/lib/audio.ts`
- Create: `frontend/components/MicLevelMeter.tsx`
- Create: `frontend/components/QualityReport.tsx`
- Create: `frontend/app/onboarding/page.tsx`
- Test: `frontend/lib/audio.test.ts`

**Interfaces:**
- Consumes: `analyzeSample`, `createProfile`, `previewVoice` (tâche 13)
- Produces: `lib/audio.ts` exportant `SCRIPT_LECTURE: string`, `rmsToDbfs(rms: number): number`, `encodeWav(samples: Float32Array, sampleRate: number): Blob`, `webmToWav(blob: Blob): Promise<Blob>`, `AudioQueue` (classe avec `push(blob: Blob)`, `stop()`, `get isPlaying(): boolean`).

**Contrainte de format — corrigée au scan pré-vol.** `libsndfile`, utilisé par `soundfile` en tâche 3, **ne décode pas le WebM** que produit `MediaRecorder`. L'échantillon doit donc être converti en WAV **dans le navigateur** avant l'envoi. `webmToWav` s'appuie sur `AudioContext.decodeAudioData` — le navigateur décode nativement son propre WebM — et rééchantillonne à 24 kHz mono en créant le contexte à cette fréquence. Aucune dépendance nouvelle, ni côté client ni côté serveur.

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

```typescript
// frontend/lib/audio.test.ts
import { describe, expect, it } from "vitest";
import { SCRIPT_LECTURE, encodeWav, rmsToDbfs } from "./audio";

describe("encodeWav", () => {
  async function entete(blob: Blob) {
    return new DataView(await blob.arrayBuffer());
  }

  it("produit un en-tete RIFF/WAVE", async () => {
    const vue = await entete(encodeWav(new Float32Array(10), 24000));
    const lire = (o: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => vue.getUint8(o + i)));
    expect(lire(0)).toBe("RIFF");
    expect(lire(8)).toBe("WAVE");
  });

  it("declare mono, 16 bits, a la frequence demandee", async () => {
    const vue = await entete(encodeWav(new Float32Array(10), 24000));
    expect(vue.getUint16(22, true)).toBe(1); // canaux
    expect(vue.getUint32(24, true)).toBe(24000); // frequence
    expect(vue.getUint16(34, true)).toBe(16); // bits par echantillon
  });

  it("ecrit deux octets par echantillon", async () => {
    const blob = encodeWav(new Float32Array(100), 24000);
    expect(blob.size).toBe(44 + 200);
  });

  it("borne les valeurs hors de l'intervalle [-1, 1]", async () => {
    const vue = await entete(encodeWav(new Float32Array([2, -2]), 24000));
    expect(vue.getInt16(44, true)).toBe(32767);
    expect(vue.getInt16(46, true)).toBe(-32768);
  });
});

describe("rmsToDbfs", () => {
  it("convertit un signal pleine echelle en 0 dBFS", () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 1);
  });
  it("convertit la moitie en environ -6 dBFS", () => {
    expect(rmsToDbfs(0.5)).toBeCloseTo(-6, 0);
  });
  it("ne renvoie jamais -Infinity sur un silence total", () => {
    expect(Number.isFinite(rmsToDbfs(0))).toBe(true);
  });
});

describe("script de lecture", () => {
  it("est assez long pour tenir les 30 secondes minimum", () => {
    // ~150 mots par minute a l'oral : 30 s exigent au moins 75 mots.
    expect(SCRIPT_LECTURE.split(/\s+/).length).toBeGreaterThanOrEqual(110);
  });
  it("couvre les sons nasaux du francais", () => {
    for (const son of ["on", "an", "in", "un"]) {
      expect(SCRIPT_LECTURE.toLowerCase()).toContain(son);
    }
  });
  it("contient des chiffres, souvent mal rendus par les modeles", () => {
    expect(/\d/.test(SCRIPT_LECTURE)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `cd frontend && npx vitest run lib/audio.test.ts`
Expected: FAIL — le module `./audio` n'existe pas

- [ ] **Step 3: Écrire les utilitaires audio**

```typescript
// frontend/lib/audio.ts
export const SCRIPT_LECTURE = `
Bonjour, je m'appelle et je travaille depuis maintenant plusieurs années dans
l'accompagnement des entreprises. Mon quotidien consiste à comprendre un besoin,
puis à construire une réponse concrète avec mes clients. Quand un dossier avance
bien, nous bouclons en moins de trois semaines, parfois en 15 jours seulement.
Ce matin, j'ai reçu un appel important au sujet d'un contrat de 24 000 euros.
La discussion portait sur un point sensible : le délai de déploiement. J'ai
expliqué calmement notre méthode, en montrant chaque étape, sans rien enjoliver.
Un bon échange commence toujours par une écoute attentive, un ton posé, et
beaucoup d'honnêteté. Merci d'avoir pris ce temps ; je vous propose que nous
avancions ensemble sur la suite.
`.trim();

export function rmsToDbfs(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

export const TAUX_CIBLE = 24000;

/** Encode du PCM flottant en WAV mono 16 bits. libsndfile ne lit pas le WebM. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const tampon = new ArrayBuffer(44 + samples.length * 2);
  const vue = new DataView(tampon);
  const texte = (offset: number, valeur: string) => {
    for (let i = 0; i < valeur.length; i++) vue.setUint8(offset + i, valeur.charCodeAt(i));
  };

  texte(0, "RIFF");
  vue.setUint32(4, 36 + samples.length * 2, true);
  texte(8, "WAVE");
  texte(12, "fmt ");
  vue.setUint32(16, 16, true); // taille du bloc fmt
  vue.setUint16(20, 1, true); // PCM entier
  vue.setUint16(22, 1, true); // mono
  vue.setUint32(24, sampleRate, true);
  vue.setUint32(28, sampleRate * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // alignement de bloc
  vue.setUint16(34, 16, true); // bits par echantillon
  texte(36, "data");
  vue.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const borne = Math.max(-1, Math.min(1, samples[i]));
    vue.setInt16(44 + i * 2, borne < 0 ? borne * 0x8000 : borne * 0x7fff, true);
  }
  return new Blob([tampon], { type: "audio/wav" });
}

/**
 * Convertit l'enregistrement WebM de MediaRecorder en WAV 24 kHz mono.
 * Le navigateur decode nativement son propre WebM ; creer le contexte a la
 * frequence cible fait le reechantillonnage au passage.
 */
export async function webmToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: TAUX_CIBLE });
  try {
    const decode = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(decode.getChannelData(0), decode.sampleRate);
  } finally {
    void ctx.close();
  }
}

/** Lit des extraits audio strictement dans l'ordre d'arrivee. */
export class AudioQueue {
  private file: Blob[] = [];
  private courant: HTMLAudioElement | null = null;
  private actif = false;

  get isPlaying(): boolean {
    return this.actif;
  }

  push(blob: Blob): void {
    this.file.push(blob);
    if (!this.actif) void this.suivant();
  }

  private async suivant(): Promise<void> {
    const blob = this.file.shift();
    if (!blob) {
      this.actif = false;
      return;
    }
    this.actif = true;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.courant = audio;
    audio.onended = audio.onerror = () => {
      URL.revokeObjectURL(url);
      void this.suivant();
    };
    await audio.play().catch(() => {
      URL.revokeObjectURL(url);
      void this.suivant();
    });
  }

  stop(): void {
    this.file = [];
    this.courant?.pause();
    this.courant = null;
    this.actif = false;
  }
}
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `cd frontend && npx vitest run lib/audio.test.ts`
Expected: PASS, 10 tests

Note : les tests de `encodeWav` tournent sous l'environnement `jsdom` de vitest. `webmToWav` n'est pas testé unitairement — il dépend du décodeur natif du navigateur, absent de jsdom ; il est vérifié à la main lors du premier onboarding réel.

- [ ] **Step 5: Écrire le vumètre**

```tsx
// frontend/components/MicLevelMeter.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { rmsToDbfs } from "@/lib/audio";

export function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [dbfs, setDbfs] = useState(-60);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const tampon = new Float32Array(analyser.fftSize);

    const boucle = () => {
      analyser.getFloatTimeDomainData(tampon);
      let somme = 0;
      for (const v of tampon) somme += v * v;
      setDbfs(rmsToDbfs(Math.sqrt(somme / tampon.length)));
      frame.current = requestAnimationFrame(boucle);
    };
    boucle();
    return () => {
      cancelAnimationFrame(frame.current);
      void ctx.close();
    };
  }, [stream]);

  const pourcent = Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100));
  const correct = dbfs > -18 && dbfs < -1;

  return (
    <div className="space-y-2">
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] duration-75 ${
            correct ? "bg-emerald-500" : dbfs >= -1 ? "bg-red-500" : "bg-amber-500"
          }`}
          style={{ width: `${pourcent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {dbfs >= -1
          ? "Trop fort : éloignez-vous du micro."
          : dbfs <= -18
            ? "Trop faible : rapprochez-vous du micro."
            : "Niveau correct, vous pouvez enregistrer."}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Écrire le rapport de qualité**

```tsx
// frontend/components/QualityReport.tsx
"use client";
import type { AnalyzeResult } from "@/lib/api";

export function QualityReport({ resultat }: { resultat: AnalyzeResult }) {
  if (resultat.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          Enregistrement accepté.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Durée {resultat.metrics.duration_s.toFixed(0)} s · rapport signal/bruit{" "}
          {resultat.metrics.snr_db.toFixed(0)} dB
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        Il faut refaire l&apos;enregistrement.
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {resultat.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Écrire la page d'onboarding**

```tsx
// frontend/app/onboarding/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MicLevelMeter } from "@/components/MicLevelMeter";
import { QualityReport } from "@/components/QualityReport";
import { Button } from "@/components/ui/button";
import { analyzeSample, createProfile, previewVoice, type AnalyzeResult } from "@/lib/api";
import { SCRIPT_LECTURE, webmToWav } from "@/lib/audio";

type Etape = "micro" | "lecture" | "controle" | "validation";

export default function Onboarding() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("micro");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [erreurMicro, setErreurMicro] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState<Blob | null>(null);
  const [resultat, setResultat] = useState<AnalyzeResult | null>(null);
  const [occupe, setOccupe] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);

  async function autoriserMicro() {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
      setErreurMicro(null);
    } catch {
      setErreurMicro(
        "Micro refusé ou introuvable. Autorisez l'accès au micro dans la barre " +
          "d'adresse de votre navigateur, puis rechargez cette page."
      );
    }
  }

  function demarrer() {
    if (!stream) return;
    morceaux.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => morceaux.current.push(e.data);
    mr.onstop = async () => {
      setOccupe(true);
      // Obligatoire : soundfile ne lit pas le WebM produit par MediaRecorder.
      const wav = await webmToWav(new Blob(morceaux.current, { type: "audio/webm" }));
      setEnregistre(wav);
      setResultat(await analyzeSample(new File([wav], "e.wav", { type: "audio/wav" })));
      setOccupe(false);
      setEtape("controle");
    };
    recorder.current = mr;
    mr.start();
    setEtape("lecture");
  }

  async function enregistrerProfil() {
    if (!enregistre) return;
    setOccupe(true);
    const profil = await createProfile(
      new File([enregistre], "e.wav", { type: "audio/wav" }), "Ma voix"
    );
    const audio = await previewVoice(
      profil.id,
      "Bonjour, je suis ravi d'échanger avec vous aujourd'hui sur votre projet."
    );
    new Audio(URL.createObjectURL(audio)).play();
    setOccupe(false);
    setEtape("validation");
    setTimeout(() => router.push("/brief"), 6000);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Cloner votre voix</h1>

      {etape === "micro" && (
        <section className="space-y-4">
          <p className="text-muted-foreground">
            Commençons par vérifier votre micro. Parlez normalement : le niveau doit
            rester dans la zone verte.
          </p>
          {!stream && <Button onClick={autoriserMicro}>Autoriser le micro</Button>}
          {erreurMicro && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              {erreurMicro}
            </div>
          )}
          {stream && (
            <>
              <MicLevelMeter stream={stream} />
              <Button onClick={demarrer}>Commencer l&apos;enregistrement</Button>
            </>
          )}
        </section>
      )}

      {etape === "lecture" && (
        <section className="space-y-4">
          <p className="text-muted-foreground">
            Lisez ce texte à voix haute, à votre rythme habituel.
          </p>
          <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-6 text-xl leading-relaxed">
            {SCRIPT_LECTURE}
          </p>
          <Button onClick={() => recorder.current?.stop()} variant="secondary">
            J&apos;ai terminé
          </Button>
        </section>
      )}

      {etape === "controle" && resultat && (
        <section className="space-y-4">
          <QualityReport resultat={resultat} />
          {resultat.ok ? (
            <Button onClick={enregistrerProfil} disabled={occupe}>
              {occupe ? "Création de votre voix..." : "Créer ma voix"}
            </Button>
          ) : (
            <Button onClick={() => setEtape("micro")} variant="secondary">
              Recommencer
            </Button>
          )}
        </section>
      )}

      {etape === "validation" && (
        <section className="space-y-4">
          <p className="text-lg">
            Écoutez : voici votre voix prononçant une phrase que vous n&apos;avez pas
            enregistrée.
          </p>
          <p className="text-muted-foreground">
            Si le résultat ne vous convainc pas, refaites l&apos;enregistrement dans un
            endroit plus calme.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push("/brief")}>Cela me convient</Button>
            <Button variant="secondary" onClick={() => setEtape("micro")}>
              Recommencer
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: onboarding avec test micro, lecture et controle qualite"
```

---

### Task 15 : Brief, session et orchestration finale

**Files:**
- Create: `frontend/components/BriefForm.tsx`
- Create: `frontend/app/brief/page.tsx`
- Create: `frontend/app/session/page.tsx`
- Create: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `generateScript`, `listProfiles`, `qaSocketUrl` (tâche 13) ; `AudioQueue` (tâche 14) ; le WebSocket de la tâche 11
- Produces: l'application complète et exécutable

- [ ] **Step 1: Écrire le formulaire de brief**

```tsx
// frontend/components/BriefForm.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Brief } from "@/lib/api";

const VIDE: Brief = {
  prospect_name: "", company: "", role: "", stake: "", goal: "",
  expected_objections: [], tone: "professionnel et direct", target_duration_min: 10,
};

export function BriefForm({
  onSubmit, occupe,
}: {
  onSubmit: (b: Brief) => void;
  occupe: boolean;
}) {
  const [brief, setBrief] = useState<Brief>(VIDE);
  const [objections, setObjections] = useState("");
  const set = (k: keyof Brief) => (e: { target: { value: string } }) =>
    setBrief({ ...brief, [k]: e.target.value });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...brief,
          expected_objections: objections.split("\n").map((s) => s.trim()).filter(Boolean),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="prospect">Nom du prospect</Label>
          <Input id="prospect" required value={brief.prospect_name} onChange={set("prospect_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="societe">Société</Label>
          <Input id="societe" required value={brief.company} onChange={set("company")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fonction">Fonction</Label>
        <Input id="fonction" value={brief.role} onChange={set("role")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="enjeu">Son enjeu</Label>
        <Textarea id="enjeu" required rows={2} value={brief.stake} onChange={set("stake")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objectif">Votre objectif pour ce rendez-vous</Label>
        <Textarea id="objectif" required rows={2} value={brief.goal} onChange={set("goal")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objections">Objections attendues, une par ligne</Label>
        <Textarea
          id="objections" rows={3} value={objections}
          onChange={(e) => setObjections(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={occupe}>
        {occupe ? "Génération du script..." : "Générer la présentation"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Écrire la page de brief**

```tsx
// frontend/app/brief/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BriefForm } from "@/components/BriefForm";
import { generateScript, listProfiles, type Brief } from "@/lib/api";

export default function PageBrief() {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(brief: Brief) {
    setOccupe(true);
    setErreur(null);
    try {
      const profils = await listProfiles();
      if (profils.length === 0) {
        router.push("/onboarding");
        return;
      }
      const script = await generateScript(brief);
      sessionStorage.setItem(
        "session",
        JSON.stringify({ brief, script, profilId: profils[0].id })
      );
      router.push("/session");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Votre prochain rendez-vous</h1>
      <p className="text-muted-foreground">
        Décrivez le prospect. Ces informations restent sur votre machine.
      </p>
      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {erreur}
        </div>
      )}
      <BriefForm onSubmit={soumettre} occupe={occupe} />
    </main>
  );
}
```

- [ ] **Step 3: Écrire la page de session**

```tsx
// frontend/app/session/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qaSocketUrl, type Brief, type Script } from "@/lib/api";
import { AudioQueue } from "@/lib/audio";

type Tour = { role: "user" | "assistant"; text: string };

export default function PageSession() {
  const [contexte, setContexte] = useState<
    { brief: Brief; script: Script; profilId: string } | null
  >(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [question, setQuestion] = useState("");
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef(new AudioQueue());

  useEffect(() => {
    const brut = sessionStorage.getItem("session");
    if (!brut) return;
    const ctx = JSON.parse(brut);
    setContexte(ctx);

    const socket = new WebSocket(qaSocketUrl(ctx.profilId));
    ws.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "context", brief: ctx.brief, script: ctx.script }));
      setPret(true);
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "question") {
        setTours((t) => [...t, { role: "user", text: message.text }]);
      } else if (message.type === "sentence") {
        setTours((t) => {
          const dernier = t[t.length - 1];
          if (dernier?.role === "assistant") {
            return [...t.slice(0, -1), { ...dernier, text: `${dernier.text} ${message.text}` }];
          }
          return [...t, { role: "assistant", text: message.text }];
        });
      } else if (message.type === "audio") {
        const octets = Uint8Array.from(atob(message.wav_b64), (c) => c.charCodeAt(0));
        queue.current.push(new Blob([octets], { type: "audio/wav" }));
      } else if (message.type === "error") {
        setErreur(message.message);
      }
    };
    socket.onerror = () =>
      setErreur("Connexion au backend perdue. Vérifiez qu'il tourne sur le port 8000.");
    return () => socket.close();
  }, []);

  function envoyer() {
    if (!question.trim() || !ws.current) return;
    ws.current.send(JSON.stringify({ type: "question", text: question }));
    setQuestion("");
  }

  if (!contexte) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p>Aucune session en cours. Retournez au formulaire de brief.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {contexte.brief.prospect_name} · {contexte.brief.company}
        </h1>
      </header>

      <section className="space-y-3 rounded-lg border bg-muted/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Votre présentation
        </h2>
        {contexte.script.blocks.map((b) => (
          <p key={b.kind} className="leading-relaxed">{b.text}</p>
        ))}
      </section>

      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {erreur}
        </div>
      )}

      <section className="space-y-3">
        {tours.map((tour, i) => (
          <div
            key={i}
            className={`rounded-lg p-4 ${
              tour.role === "user" ? "bg-muted" : "border bg-background"
            }`}
          >
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {tour.role === "user" ? "Question du prospect" : "Votre réponse"}
            </p>
            <p>{tour.text}</p>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <Input
          value={question}
          placeholder="Posez la question que poserait votre prospect..."
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          disabled={!pret}
        />
        <Button onClick={envoyer} disabled={!pret}>Envoyer</Button>
        <Button variant="secondary" onClick={() => queue.current.stop()}>
          Couper
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Écrire le docker-compose (Ollama uniquement)**

```yaml
# docker-compose.yml
# Seul Ollama est conteneurise : le STT et le TTS tournent en process
# dans le backend, ou ils partagent le meme contexte CUDA.
services:
  ollama:
    image: ollama/ollama:latest
    container_name: clone-vocal-ollama
    ports:
      - "127.0.0.1:11434:11434"   # jamais expose hors de la machine
    volumes:
      - ollama-models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama-models:
```

- [ ] **Step 5: Écrire le README**

````markdown
# Clone vocal commercial

Application web **100 % locale** qui clone votre voix, reçoit le contexte d'un
rendez-vous commercial, délivre une présentation avec cette voix et répond aux
questions posées au micro.

Aucune donnée ne quitte votre machine. Voir `docs/superpowers/specs/` pour la
spécification complète.

## Prérequis

- GPU NVIDIA avec **au moins 8 Go de VRAM** (l'application refuse de démarrer en dessous)
- Python 3.11+, Node.js 20+, Docker

## Installation

```bash
# 1. Ollama et le modèle correspondant à votre carte
docker compose up -d
docker exec clone-vocal-ollama ollama pull qwen3:4b-q4_K_M   # 8-12 Go de VRAM
# docker exec clone-vocal-ollama ollama pull qwen3:8b-q4_K_M # 12 Go et plus

# 2. Backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS : source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --port 8000

# 3. Frontend, dans un autre terminal
cd frontend && npm install && npm run dev
```

Ouvrez http://localhost:3000

## Tests

```bash
cd backend && pytest -v        # aucun GPU requis
cd frontend && npx vitest run
```

## Supprimer votre voix

Le bouton « supprimer ma voix » efface le profil et l'échantillon. Pour tout
effacer manuellement : supprimez `backend/data/`.
````

- [ ] **Step 6: Lancer la suite complète**

Run: `cd backend && pytest -v` puis `cd frontend && npx vitest run`
Expected: toutes les suites passent sans GPU

- [ ] **Step 7: Commit**

```bash
git add frontend/ docker-compose.yml README.md
git commit -m "feat: formulaire de brief, session Q/R et orchestration"
```

---

## Auto-relecture du plan

**Couverture de la spec**

| Section de la spec | Tâche |
|---|---|
| §1 objectif, app web locale | 13, 15 |
| §2 contraintes, paliers VRAM | 2, README (15) |
| §3 architecture, Ollama, Chatterbox, Kyutai | 6, 8, 9, 10 |
| §4 composants (7 unités) | 2, 3, 4, 5, 7, 8, 9 |
| §5 onboarding en 5 étapes | 14 |
| §5 boucle Q/R en streaming | 5, 11 |
| §6 modèle de données | 4 |
| §7 confidentialité, suppression | 4, 10, 12, 13 |
| §8 gestion d'erreurs | 3, 6, 10, 11, 13, 14 |
| §9 tests sans GPU | toutes |
| §10 décisions ouvertes | 2, 8 (étape 5), 9 (étape 5) |

**Lacune identifiée et assumée :** le protocole d'écoute de la spec §9 — cinq phrases types, notation ressemblance et naturel, comparaison en aveugle — est une procédure manuelle exécutée par l'utilisateur sur la machine à GPU. Elle n'a pas de tâche dédiée parce qu'elle ne produit aucun code ; elle se déroule après la tâche 8, une fois la prévisualisation fonctionnelle.

**Cohérence des types** — vérifiée : `AudioMetrics` (tâche 3) est consommé tel quel par `VoiceStore.create` (tâche 4) et par la route `/api/voice/analyze` (tâche 10). `VoiceProfile` (tâche 4) est consommé par `TtsEngine.synthesize` (tâche 8) et par `qa.py` (tâche 11). `Message` (tâche 6) est utilisé par `script.py` (tâche 7) et `qa.py` (tâche 11). `Script` et `MeetingBrief` (tâche 7) traversent les tâches 10, 11, 13 et 15 sous le même nom. `SentenceChunker.feed/flush` (tâche 5) est appelé avec la même signature en tâche 11.

**Aucun placeholder** — chaque étape porte du code réel. Les deux points de vérification contre les bibliothèques réelles (tâches 8 et 9, étape 5) sont des commandes exactes à exécuter, pas des « à compléter » : le Protocol et les tests restent valides quelle que soit l'API réelle, seule l'implémentation concrète peut bouger.
