"""Les moteurs sont configurables pour permettre une demonstration sans GPU.

Les valeurs par defaut restent celles de production : une erreur de
configuration ne doit jamais faire tourner l'application en mode doublure
sans qu'on l'ait demande explicitement.
"""
from app.config import Settings, get_settings
from app.stt.transcriber import FakeTranscriber
from app.voice.engine import FakeTtsEngine


def test_les_moteurs_de_production_sont_les_valeurs_par_defaut():
    reglages = Settings()
    assert reglages.tts_engine == "chatterbox"
    assert reglages.stt_engine == "kyutai"


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
