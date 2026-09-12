import base64
import binascii

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.audio.chunking import SentenceChunker
from app.deps import get_llm, get_store, get_transcriber_dep, get_tts
from app.llm.ollama import LlmClient, Message
from app.meeting.brief import MeetingBrief
from app.meeting.script import Script
from app.stt.transcriber import Transcriber
from app.voice.engine import TtsEngine
from app.voice.store import VoiceProfile, VoiceStore

router = APIRouter(prefix="/api/qa", tags=["qa"])

_PROFIL_INTROUVABLE = "Profil vocal introuvable."
_CONTEXTE_MANQUANT = (
    "Contexte de réunion non initialisé : envoyez d'abord le brief et le "
    "script de présentation."
)
# Ces deux messages remplacent l'interpolation de l'exception d'origine, qui
# est redigee en anglais par pydantic ou par la bibliotheque standard
# (« Field required », « Invalid base64-encoded string ») et partait telle
# quelle a l'ecran d'un utilisateur francophone.
_CONTEXTE_INVALIDE = (
    "Le contexte de la réunion est incomplet ou mal formé. Revenez au "
    "formulaire de brief et régénérez la présentation."
)
_AUDIO_INVALIDE = (
    "L'enregistrement audio reçu est illisible. Refaites votre question au "
    "micro."
)

# Un moteur TTS ne leve pas que des RuntimeError : ValueError sur un texte
# vide, OSError si l'echantillon vocal a disparu du disque. Laisser passer
# l'une d'elles fermait brutalement le WebSocket et figeait l'interface, la ou
# l'utilisateur doit recevoir un message et pouvoir continuer a poser des
# questions. On reste sur des exceptions nommees : un except Exception
# masquerait les vrais defauts de programmation.
ERREURS_GENERATION = (RuntimeError, ValueError, OSError)


async def emettre_phrase(
    websocket: WebSocket, tts: TtsEngine, phrase: str, profil: VoiceProfile
) -> None:
    """Emet la paire sentence + audio attendue par le client.

    Le texte part avant la synthese : l'interface affiche la phrase pendant
    que le TTS travaille, et AudioQueue enchaine les extraits dans l'ordre
    de reception. C'est le seul protocole de sortie de ce module, partage par
    la presentation et par la boucle question/reponse.
    """
    await websocket.send_json({"type": "sentence", "text": phrase})
    audio = tts.synthesize(phrase, profil)
    await websocket.send_json(
        {"type": "audio", "wav_b64": base64.b64encode(audio).decode()}
    )


def decouper(texte: str) -> list[str]:
    """Decoupe un texte deja complet en phrases prononcables."""
    chunker = SentenceChunker()
    phrases = chunker.feed(texte)
    reste = chunker.flush()
    if reste:
        phrases.append(reste)
    return phrases

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
                        {"type": "error", "message": _PROFIL_INTROUVABLE}
                    )
                    continue
                try:
                    nouveau_brief = MeetingBrief(**entrant["brief"])
                    nouveau_script = Script(**entrant["script"])
                except (ValidationError, KeyError, TypeError):
                    await websocket.send_json(
                        {"type": "error", "message": _CONTEXTE_INVALIDE}
                    )
                    continue
                # Assignation groupee, apres coup : un brief valide accompagne
                # d'un script invalide (ou l'inverse) ne doit pas laisser le
                # contexte dans un etat mi-ancien mi-nouveau.
                brief, script = nouveau_brief, nouveau_script
                continue

            if type_message == "present":
                if brief is None or script is None or profil is None:
                    await websocket.send_json(
                        {"type": "error", "message": _CONTEXTE_MANQUANT}
                    )
                    continue
                try:
                    for bloc in script.blocks:
                        # Un chunker neuf par bloc : sans cela, un bloc qui ne
                        # se termine pas par une ponctuation forte deborderait
                        # sur le suivant et les deux seraient prononces d'un
                        # seul souffle.
                        for phrase in decouper(bloc.text):
                            await emettre_phrase(websocket, tts, phrase, profil)
                except ERREURS_GENERATION as err:
                    await websocket.send_json({"type": "error", "message": str(err)})
                    continue
                # La presentation n'entre PAS dans l'historique : ce n'est pas
                # un echange, et build_answer_messages injecte deja le script
                # complet dans le contexte du modele.
                await websocket.send_json({"type": "done"})
                continue

            if type_message in ("question", "audio"):
                if brief is None or script is None or profil is None:
                    await websocket.send_json(
                        {"type": "error", "message": _CONTEXTE_MANQUANT}
                    )
                    continue

                if type_message == "audio":
                    try:
                        wav_bytes = base64.b64decode(entrant["wav_b64"])
                    except (KeyError, TypeError, binascii.Error):
                        await websocket.send_json(
                            {"type": "error", "message": _AUDIO_INVALIDE}
                        )
                        continue
                    question = stt.transcribe(wav_bytes)
                else:
                    question = entrant["text"]

                await websocket.send_json({"type": "question", "text": question})

                chunker = SentenceChunker()
                reponse_complete: list[str] = []

                messages = build_answer_messages(brief, script, historique, question)
                echec: str | None = None
                try:
                    async for morceau in llm.stream_chat(messages):
                        for phrase in chunker.feed(morceau):
                            reponse_complete.append(phrase)
                            await emettre_phrase(websocket, tts, phrase, profil)
                    reste = chunker.flush()
                    if reste:
                        reponse_complete.append(reste)
                        await emettre_phrase(websocket, tts, reste, profil)
                except ERREURS_GENERATION as err:
                    echec = str(err)

                # L'historique enregistre ce qui a ETE prononce, meme quand la
                # generation s'interrompt en cours de route. Sans cela le
                # modele oublierait une reponse que le prospect vient
                # d'entendre et se contredirait au tour suivant.
                if echec is None or reponse_complete:
                    historique.append({"role": "user", "content": question})
                    historique.append(
                        {"role": "assistant", "content": " ".join(reponse_complete)}
                    )

                if echec is not None:
                    await websocket.send_json({"type": "error", "message": echec})
                    continue

                await websocket.send_json({"type": "done"})
                continue

            await websocket.send_json(
                {"type": "error", "message": f"Message non reconnu par le backend (type {type_message!r})."}
            )
    except WebSocketDisconnect:
        return
