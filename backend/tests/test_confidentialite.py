"""Exerce une session complete et verifie qu'aucune requete ne sort de la machine.

L'espion lui-meme vit dans conftest.py : il est `autouse`, donc TOUTE la suite
est deja un test de confidentialite et son assertion tombe au demontage, pas
en derniere ligne d'un test ou un echec anterieur la masquerait.

Ce fichier-ci apporte ce que l'espion seul ne donne pas : un parcours qui
touche reellement chaque chemin susceptible d'aller chercher quelque chose sur
le reseau -- analyse d'echantillon, creation et listage de profil, generation
de script par le LLM, apercu TTS, question au clavier ET question au micro
(la branche qui chargerait un modele de transcription), puis suppression.

Si ce test echoue sur une sortie reseau, c'est un defaut bloquant : ne
l'assouplissez jamais pour faire passer la suite.
"""
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


def _attendre_done(ws) -> None:
    """Draine les messages jusqu'a `done`.

    Un `error` est un echec explicite : sans cette garde, la boucle attendrait
    indefiniment un `done` qui ne viendra jamais et figerait toute la suite.
    """
    for _ in range(200):
        message = ws.receive_json()
        if message["type"] == "done":
            return
        assert message["type"] != "error", (
            f"le backend a renvoye une erreur : {message.get('message')}"
        )
    raise AssertionError("la boucle question/reponse ne se termine pas")


def test_aucune_sortie_reseau_pendant_une_session_complete(client, wav_valide):
    analyse = client.post(
        "/api/voice/analyze", files={"file": ("e.wav", wav_valide, "audio/wav")}
    )
    assert analyse.status_code == 200, analyse.text
    assert analyse.json()["ok"] is True

    reponse = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", wav_valide, "audio/wav")},
        data={"label": "Ma voix"},
    )
    assert reponse.status_code == 201, reponse.text
    profil_id = reponse.json()["id"]

    liste = client.get("/api/voice/profiles")
    assert liste.status_code == 200
    assert [p["id"] for p in liste.json()] == [profil_id]

    assert client.post("/api/meeting/script", json=BRIEF).status_code == 200

    apercu = client.post(
        f"/api/voice/profiles/{profil_id}/preview",
        json={"text": "Bonjour, ceci est un essai de ma voix clonee."},
    )
    assert apercu.status_code == 200

    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})

        ws.send_json({"type": "present"})
        _attendre_done(ws)

        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        _attendre_done(ws)

        # La branche micro : c'est elle qui chargerait un modele de
        # transcription, donc la plus susceptible d'aller le telecharger.
        ws.send_json(
            {"type": "audio", "wav_b64": base64.b64encode(wav_valide).decode()}
        )
        _attendre_done(ws)

    assert client.delete(f"/api/voice/profiles/{profil_id}").status_code == 204

    # L'assertion anti-fuite est portee par la fixture autouse `sorties_reseau`
    # (conftest.py) et tombe au demontage de ce test.
