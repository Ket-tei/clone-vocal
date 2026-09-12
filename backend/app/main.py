from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.capability import InsufficientVramError
from app.config import get_settings
from app.routes import health, meeting, qa, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().ensure_dirs()
    yield


# L'interface tourne sur le port 3000 et le backend sur le 8000 : pour un
# navigateur, chaque appel est une requete cross-origin. Sans ce middleware,
# la preflight OPTIONS recoit un 405 et toutes les requetes sont bloquees --
# invisible dans les tests, qui passent par TestClient (meme origine).
# On n'autorise que les deux orthographes locales de l'interface, jamais "*" :
# l'application tourne sur la machine de l'utilisateur, rien ne justifie
# d'ouvrir plus large.
ORIGINES_AUTORISEES = ["http://localhost:3000", "http://127.0.0.1:3000"]

app = FastAPI(title="Clone vocal commercial", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINES_AUTORISEES,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(voice.router)
app.include_router(meeting.router)
app.include_router(qa.router)


@app.exception_handler(InsufficientVramError)
async def vram_insuffisante(request: Request, exc: InsufficientVramError) -> JSONResponse:
    # select_tier() est appelee depuis _llm() dans deps.py, pendant la
    # resolution de la dependance get_llm : avant meme le corps de la route,
    # donc aucun try/except pose dans une route ne peut jamais l'intercepter.
    # Sans ce gestionnaire, FastAPI renvoie un 500 generique la ou
    # l'utilisateur doit comprendre que sa carte graphique est trop petite.
    return JSONResponse(status_code=503, content={"detail": str(exc)})
