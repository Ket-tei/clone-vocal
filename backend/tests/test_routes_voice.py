import io

import numpy as np
import soundfile as sf

SR = 24000

def _wav(duree_s=45.0, pic=0.7):
    """Echantillon synthetique valide.

    La normalisation du pic est OBLIGATOIRE : un bruit gaussien d'ecart-type
    0.3 sur 45 s atteint un maximum d'environ sigma * sqrt(2 ln N) = 1.58,
    donc au-dela de la pleine echelle. Sans normalisation, validate() rejette
    l'echantillon comme sature et aucun test "bon echantillon" ne peut passer.
    Un pic de 0.7 donne -3.1 dBFS, confortablement dans l'intervalle
    [-18.0, -1.0] exige par la tache 3.
    """
    n = int(duree_s * SR)
    rng = np.random.default_rng(0)
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / SR)
    signal = rng.normal(0, 0.3, n) * env
    signal = signal / np.max(np.abs(signal)) * pic
    tampon = io.BytesIO()
    sf.write(tampon, signal.astype(np.float32), SR, format="WAV")
    return tampon.getvalue()

def test_analyze_accepte_un_bon_echantillon(client):
    r = client.post("/api/voice/analyze", files={"file": ("e.wav", _wav(), "audio/wav")})
    assert r.status_code == 200
    assert r.json()["ok"] is True

def test_analyze_refuse_un_echantillon_trop_court(client):
    r = client.post("/api/voice/analyze", files={"file": ("e.wav", _wav(5.0), "audio/wav")})
    assert r.json()["ok"] is False
    assert r.json()["problems"]

def test_fichier_illisible_donne_422_et_pas_500(client):
    """Un enregistrement corrompu ne doit jamais produire une erreur serveur."""
    r = client.post(
        "/api/voice/analyze",
        files={"file": ("e.wav", b"ceci n'est pas du wav", "audio/wav")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["problems"]

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

def test_creation_refusee_si_fichier_illisible(client):
    """Meme constat sur /profiles : illisible n'est pas un 500."""
    r = client.post(
        "/api/voice/profiles",
        files={"file": ("e.wav", b"ceci n'est pas du wav", "audio/wav")},
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

def test_preview_profil_inconnu_donne_404(client):
    r = client.post(
        "/api/voice/profiles/inexistant/preview", json={"text": "Bonjour."}
    )
    assert r.status_code == 404
