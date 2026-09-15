import tempfile
from pathlib import Path

import soundfile as sf
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
    except sf.LibsndfileError as err:
        raise HTTPException(
            422,
            detail={
                "problems": [
                    (
                        "Le fichier audio est illisible ou incomplet. "
                        "Refaites l'enregistrement."
                    )
                ]
            },
        ) from err
    finally:
        chemin.unlink(missing_ok=True)

@router.get("/status")
def statut(tts: TtsEngine = Depends(get_tts)) -> dict:
    # L'interface s'en sert pour estimer la duree de creation de la voix : le
    # premier chargement du modele prend plusieurs minutes, une synthese non.
    return {"modele_charge": bool(getattr(tts, "modele_charge", True))}

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
