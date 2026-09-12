import io
import wave

import pytest

from app.voice.engine import FakeTtsEngine, get_engine
from app.voice.store import VoiceProfile

PROFIL = VoiceProfile(
    id="abc", label="Ma voix", created_at="2026-09-11T00:00:00+00:00",
    sample_path="/tmp/abc.wav", duration_s=45.0, snr_db=30.0,
    peak_dbfs=-6.0, engine="chatterbox",
)

def test_fake_produit_un_wav_lisible():
    audio = FakeTtsEngine().synthesize("Bonjour Claire.", PROFIL)
    with wave.open(io.BytesIO(audio)) as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 24000
        assert w.getnframes() > 0

def test_fake_memorise_les_appels():
    moteur = FakeTtsEngine()
    moteur.synthesize("Une phrase.", PROFIL)
    moteur.synthesize("Une autre.", PROFIL)
    assert moteur.appels == [("Une phrase.", "abc"), ("Une autre.", "abc")]

def test_duree_croit_avec_la_longueur_du_texte():
    moteur = FakeTtsEngine()
    court = moteur.synthesize("Court.", PROFIL)
    long = moteur.synthesize("Un texte nettement plus long que le precedent.", PROFIL)
    assert len(long) > len(court)

def test_texte_vide_est_refuse():
    with pytest.raises(ValueError, match="vide"):
        FakeTtsEngine().synthesize("   ", PROFIL)

def test_get_engine_fake():
    assert isinstance(get_engine("fake"), FakeTtsEngine)

def test_get_engine_inconnu_est_refuse():
    with pytest.raises(ValueError, match="inconnu"):
        get_engine("inexistant")
