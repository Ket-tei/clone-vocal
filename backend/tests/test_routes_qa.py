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
