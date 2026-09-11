def test_health_repond_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_startup_crée_voices_dir(monkeypatch, tmp_path):
    """Valide que le gestionnaire de démarrage (lifespan) s'exécute
    et crée le répertoire voices_dir."""
    from app.config import get_settings
    from fastapi.testclient import TestClient
    from app.main import app

    # Nettoyer le cache pour éviter les valeurs en cache du test précédent
    get_settings.cache_clear()

    # Rediriger data_dir vers tmp_path pour isoler le test
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    # Le gestionnaire de contexte déclenche le lifespan et exécute ensure_dirs()
    with TestClient(app) as testeur:
        settings = get_settings()
        assert settings.voices_dir.exists(), "voices_dir devrait exister après le startup"

    # Nettoyer le cache après le test
    get_settings.cache_clear()
