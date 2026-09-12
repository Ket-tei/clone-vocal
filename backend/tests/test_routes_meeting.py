from app import deps
from app.capability import InsufficientVramError
from app.main import app

BRIEF = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts de traitement des factures",
    "goal": "Obtenir un second rendez-vous technique",
    "expected_objections": ["Le prix"],
    "tone": "direct et chiffre",
    "target_duration_min": 10,
}

def test_generation_de_script(client):
    r = client.post("/api/meeting/script", json=BRIEF)
    assert r.status_code == 200
    assert [b["kind"] for b in r.json()["blocks"]] == [
        "accroche", "probleme", "solution", "preuve", "next_step",
    ]

def test_brief_invalide_renvoie_422(client):
    r = client.post("/api/meeting/script", json={**BRIEF, "prospect_name": ""})
    assert r.status_code == 422

def test_vram_insuffisante_renvoie_503_avec_message_clair(client):
    """InsufficientVramError est levee par _llm() pendant la resolution de la
    dependance get_llm, donc avant le corps de la route : le try/except de
    creer_script ne peut pas l'attraper. C'est le gestionnaire d'exception
    global de app/main.py qui doit produire un message clair plutot qu'un
    500 generique."""
    def _vram_insuffisante():
        raise InsufficientVramError(
            "VRAM detectee : 4.0 Go. Le minimum requis est 8.0 Go."
        )

    app.dependency_overrides[deps.get_llm] = _vram_insuffisante
    r = client.post("/api/meeting/script", json=BRIEF)

    assert r.status_code == 503
    assert r.json()["detail"] == "VRAM detectee : 4.0 Go. Le minimum requis est 8.0 Go."
