import base64

from app import deps
from app.main import app

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

async def test_le_tts_est_appele_avant_la_fin_du_flux_llm(client, wav_valide):
    """Preuve du streaming : au moment ou le LLM produit son second fragment,
    la premiere phrase doit deja avoir ete synthetisee. Une implementation
    qui accumulerait tout le flux avant de decouper donnerait 0 ici."""
    tts = app.dependency_overrides[deps.get_tts]()

    class LlmObservateur:
        def __init__(self) -> None:
            self.derniers_messages: list = []
            self.appels_tts_au_second_fragment: int | None = None

        async def stream_chat(self, messages):
            self.derniers_messages = messages
            yield "Voici la premiere phrase complete. "
            self.appels_tts_au_second_fragment = len(tts.appels)
            yield "Et voici la seconde phrase complete. "

    observateur = LlmObservateur()
    app.dependency_overrides[deps.get_llm] = lambda: observateur

    profil_id = _profil(client, wav_valide)
    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass

    assert observateur.appels_tts_au_second_fragment == 1, (
        "le TTS doit avoir synthetise la premiere phrase avant que le LLM "
        "ne produise la suite"
    )

def test_contexte_invalide_renvoie_une_erreur_et_la_connexion_reste_utilisable(
    client, wav_valide
):
    profil_id = _profil(client, wav_valide)
    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        brief_incomplet = {k: v for k, v in BRIEF.items() if k != "prospect_name"}
        ws.send_json({"type": "context", "brief": brief_incomplet, "script": SCRIPT})
        message = ws.receive_json()
        assert message["type"] == "error"

        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass

def test_audio_invalide_renvoie_une_erreur_et_la_connexion_reste_utilisable(
    client, wav_valide
):
    profil_id = _profil(client, wav_valide)
    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "audio", "wav_b64": "###pas du base64###"})
        message = ws.receive_json()
        assert message["type"] == "error"

        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass

def test_le_second_tour_contient_l_historique_du_premier(client, wav_valide, llm_espion):
    with client.websocket_connect(f"/api/qa/{_profil(client, wav_valide)}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})

        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        while ws.receive_json()["type"] != "done":
            pass

        ws.send_json({"type": "question", "text": "Et pour la mise en place ?"})
        while ws.receive_json()["type"] != "done":
            pass

    corps = [m["content"] for m in llm_espion.derniers_messages]
    assert any("Quel est le prix ?" in c for c in corps)
    assert any("Et pour la mise en place ?" in c for c in corps)
    roles = [m["role"] for m in llm_espion.derniers_messages]
    assert "assistant" in roles
