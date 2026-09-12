import base64

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.audio.chunking import SentenceChunker
from app.deps import get_llm, get_store, get_transcriber_dep, get_tts
from app.llm.ollama import LlmClient, Message
from app.meeting.brief import MeetingBrief
from app.meeting.script import Script
from app.stt.transcriber import Transcriber
from app.voice.engine import TtsEngine
from app.voice.store import VoiceProfile, VoiceStore

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

                # Snapshot non optionnel pour la fermeture ci-dessous : le
                # controle ci-dessus n'est pas visible pour un analyseur
                # statique a travers `emettre`, et cela garde la logique
                # correcte meme si `profil` venait a etre reassigne a None
                # plus tard dans la boucle.
                profil_actif: VoiceProfile = profil

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
                    audio = tts.synthesize(phrase, profil_actif)
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
