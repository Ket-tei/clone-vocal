# Clone vocal commercial

Application web **100 % locale** qui clone votre voix, reçoit le contexte d'un
rendez-vous commercial, délivre une présentation avec cette voix et répond aux
questions posées au clavier ou au micro.

Aucune donnée ne quitte votre machine. Voir `docs/superpowers/specs/` pour la
spécification complète.

## Prérequis

- GPU NVIDIA avec **au moins 8 Go de VRAM** (en dessous, le backend répond
  **503** avec un message explicite — « VRAM detectee : X Go. Le minimum
  requis est 8.0 Go. » — dès la première requête qui sollicite le modèle de
  langage, script ou question/réponse ; ce n'est pas un plantage silencieux)
- Python 3.11+, Node.js 20.9+, Docker (avec le support GPU NVIDIA pour Compose)

## Installation

```bash
# 1. Ollama et le modèle correspondant à votre carte
docker compose up -d
docker exec clone-vocal-ollama ollama pull qwen3:4b-q4_K_M   # 8 à 12 Go de VRAM
# docker exec clone-vocal-ollama ollama pull qwen3:8b-q4_K_M # 12 Go et plus

# 2. Backend, depuis la racine du dépôt
cd backend
python -m venv .venv
.venv/Scripts/activate   # Linux/macOS : source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --port 8000

# 3. Frontend, dans un autre terminal, depuis la racine du dépôt
cd frontend
npm install
npm run dev
```

Ouvrez http://localhost:3000

## Tests

Aucun des deux suites ne nécessite de GPU (le LLM, le TTS et la
transcription sont remplacés par des doublures dans les tests).

```bash
# Backend, avec le venv activé (voir installation ci-dessus)
cd backend && .venv/Scripts/python -m pytest -v

# Frontend
cd frontend && npx vitest run
```

## Supprimer votre voix

Le bouton « Supprimer ma voix », sur la page d'accueil, efface le profil
vocal et l'échantillon audio associé (il ne s'affiche que si une voix a déjà
été clonée ; une confirmation est demandée avant suppression).

Deux autres façons de tout effacer, si besoin :

- Via l'API : `curl -X DELETE http://127.0.0.1:8000/api/voice/profiles/<id>`
  (`<id>` s'obtient avec `curl http://127.0.0.1:8000/api/voice/profiles`).
- Manuellement : `backend/data/` contient l'intégralité de vos données
  (base SQLite et échantillon audio). Le supprimer efface tout.
