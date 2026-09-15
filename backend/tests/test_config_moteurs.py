"""Les moteurs sont configurables pour permettre une demonstration sans GPU.

Les valeurs par defaut restent celles de production : une erreur de
configuration ne doit jamais faire tourner l'application en mode doublure
sans qu'on l'ait demande explicitement.
"""
from app.config import Settings, get_settings
from app.stt.transcriber import FakeTranscriber
from app.voice.engine import FakeTtsEngine


def test_les_moteurs_de_production_sont_les_valeurs_par_defaut(tmp_path, monkeypatch):
    # Dossier vide : un .env de developpeur ne doit pas fausser ce test.
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("TTS_ENGINE", raising=False)
    monkeypatch.delenv("STT_ENGINE", raising=False)
    reglages = Settings()
    # Application francophone : le modele multilingue, en francais.
    assert reglages.tts_engine == "chatterbox_mtl"
    assert reglages.stt_engine == "kyutai"


def test_un_fichier_env_du_dossier_courant_est_lu(tmp_path, monkeypatch):
    """Sur une nouvelle machine, copier .env.example en .env suffit a lancer sans GPU."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("TTS_ENGINE", raising=False)
    monkeypatch.delenv("STT_ENGINE", raising=False)
    (tmp_path / ".env").write_text("TTS_ENGINE=fake\nSTT_ENGINE=fake\n", encoding="utf-8")
    reglages = Settings()
    assert reglages.tts_engine == "fake"
    assert reglages.stt_engine == "fake"


def test_les_moteurs_sont_surchargeables_par_l_environnement(monkeypatch):
    monkeypatch.setenv("TTS_ENGINE", "fake")
    monkeypatch.setenv("STT_ENGINE", "fake")
    reglages = Settings()
    assert reglages.tts_engine == "fake"
    assert reglages.stt_engine == "fake"


def test_le_mode_doublure_fournit_des_moteurs_utilisables(monkeypatch):
    """Le parcours d'onboarding doit aller jusqu'au bout sans GPU."""
    from app import deps

    monkeypatch.setenv("TTS_ENGINE", "fake")
    monkeypatch.setenv("STT_ENGINE", "fake")
    get_settings.cache_clear()
    deps._tts.cache_clear()
    deps._stt.cache_clear()
    try:
        assert isinstance(deps.get_tts(), FakeTtsEngine)
        assert isinstance(deps.get_transcriber_dep(), FakeTranscriber)
    finally:
        get_settings.cache_clear()
        deps._tts.cache_clear()
        deps._stt.cache_clear()
