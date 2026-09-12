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
