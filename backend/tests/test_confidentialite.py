"""Verifie qu'aucune requete ne part vers un hote externe pendant une session.

L'auto-hebergement de cette application est motive par la confidentialite :
la voix clonee est une donnee biometrique, et les briefs prospects portent
des noms, des montants et des enjeux commerciaux. Ce test transforme cette
promesse en propriete verifiee a chaque execution de la suite.

Si ce test echoue, c'est un defaut bloquant : ne l'assouplissez jamais pour
faire passer la suite.
"""
import socket

import pytest

HOTES_LOCAUX = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "testserver"}

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
    reponse = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", wav_valide, "audio/wav")},
        data={"label": "Ma voix"},
    )
    assert reponse.status_code == 201, reponse.text
    profil_id = reponse.json()["id"]

    assert client.post("/api/meeting/script", json=BRIEF).status_code == 200

    apercu = client.post(
        f"/api/voice/profiles/{profil_id}/preview",
        json={"text": "Bonjour, ceci est un essai de ma voix clonee."},
    )
    assert apercu.status_code == 200

    with client.websocket_connect(f"/api/qa/{profil_id}") as ws:
        ws.send_json({"type": "context", "brief": BRIEF, "script": SCRIPT})
        ws.send_json({"type": "question", "text": "Quel est le prix ?"})
        vus = 0
        while ws.receive_json()["type"] != "done":
            vus += 1
            assert vus < 200, "la boucle question/reponse ne se termine pas"

    assert client.delete(f"/api/voice/profiles/{profil_id}").status_code == 204

    assert sorties_reseau == [], (
        f"Des connexions sont parties vers des hotes externes : "
        f"{sorted(set(sorties_reseau))}. L'application doit fonctionner sans "
        f"aucune sortie reseau."
    )
