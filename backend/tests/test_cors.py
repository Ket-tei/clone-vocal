"""Verifie que le navigateur peut reellement parler au backend.

L'interface est servie sur le port 3000, le backend sur le 8000 : toutes les
requetes du navigateur sont cross-origin. Les autres tests de la suite passent
par TestClient, donc en meme origine, et ne voient jamais ce mur.
"""

ORIGINE_INTERFACE = "http://localhost:3000"
ORIGINE_INTERFACE_IP = "http://127.0.0.1:3000"
ORIGINE_ETRANGERE = "http://exemple-malveillant.invalid"


def test_la_preflight_de_l_interface_est_acceptee(client):
    reponse = client.options(
        "/api/meeting/script",
        headers={
            "Origin": ORIGINE_INTERFACE,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert reponse.status_code == 200, reponse.text
    assert reponse.headers.get("access-control-allow-origin") == ORIGINE_INTERFACE


def test_une_requete_simple_de_l_interface_porte_l_en_tete_cors(client):
    reponse = client.get("/api/voice/profiles", headers={"Origin": ORIGINE_INTERFACE})
    assert reponse.status_code == 200
    assert reponse.headers.get("access-control-allow-origin") == ORIGINE_INTERFACE


def test_l_origine_en_127_0_0_1_est_aussi_autorisee(client):
    reponse = client.get("/api/voice/profiles", headers={"Origin": ORIGINE_INTERFACE_IP})
    assert reponse.headers.get("access-control-allow-origin") == ORIGINE_INTERFACE_IP


def test_une_origine_etrangere_n_obtient_pas_l_en_tete(client):
    reponse = client.get("/api/voice/profiles", headers={"Origin": ORIGINE_ETRANGERE})
    # Le corps peut repondre 200 (le serveur ne bloque pas), mais sans
    # l'en-tete le navigateur refuse de livrer la reponse au script appelant.
    assert "access-control-allow-origin" not in reponse.headers


def test_la_preflight_d_une_origine_etrangere_est_refusee(client):
    reponse = client.options(
        "/api/meeting/script",
        headers={
            "Origin": ORIGINE_ETRANGERE,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert reponse.headers.get("access-control-allow-origin") != ORIGINE_ETRANGERE
