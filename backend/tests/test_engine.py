import io
import wave

import numpy as np
import pytest

from app.voice.engine import (
    ChatterboxEngine,
    ChatterboxMultilingualEngine,
    FakeTtsEngine,
    get_engine,
)
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
        assert w.getsampwidth() == 2, "16 bits par echantillon"

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

def test_get_engine_chatterbox_sans_charger_le_modele():
    """La branche de production : instancier ne doit rien charger."""
    moteur = get_engine("chatterbox")
    assert isinstance(moteur, ChatterboxEngine)
    assert moteur.device == "cuda"
    assert moteur._modele is None, "le modele ne doit etre charge qu'a la synthese"

def test_get_engine_chatterbox_mtl_sans_charger_le_modele():
    moteur = get_engine("chatterbox_mtl", "cpu")
    assert isinstance(moteur, ChatterboxMultilingualEngine)
    assert moteur.device == "cpu"
    assert moteur.langue == "fr"
    assert moteur.modele_charge is False

def test_fake_est_toujours_pret():
    assert FakeTtsEngine().modele_charge is True

class _ModeleMultilingueEspion:
    sr = 24000

    def __init__(self) -> None:
        self.conditionnements: list[str] = []
        self.generations: list[tuple[str, str, object]] = []

    def prepare_conditionals(self, chemin, exaggeration=0.5):
        self.conditionnements.append(chemin)

    def generate(self, text, language_id, audio_prompt_path=None, **kwargs):
        self.generations.append((text, language_id, audio_prompt_path))
        return np.zeros((1, 2400), dtype=np.float32)

def test_mtl_parle_francais_et_reutilise_l_empreinte_vocale():
    """Recalculer l'empreinte de la voix a chaque phrase coute plusieurs
    secondes sur CPU : elle ne change que si l'echantillon change."""
    moteur = ChatterboxMultilingualEngine("cpu")
    espion = _ModeleMultilingueEspion()
    moteur._modele = espion

    audio = moteur.synthesize("Bonjour Claire.", PROFIL)
    moteur.synthesize("Merci pour votre temps.", PROFIL)

    assert espion.conditionnements == [PROFIL.sample_path]
    assert [(t, l) for t, l, _ in espion.generations] == [
        ("Bonjour Claire.", "fr"), ("Merci pour votre temps.", "fr"),
    ]
    assert all(p is None for _, _, p in espion.generations)
    with wave.open(io.BytesIO(audio)) as w:
        assert w.getframerate() == 24000
        assert w.getnframes() == 2400

def test_mtl_texte_vide_est_refuse_sans_charger_le_modele():
    with pytest.raises(ValueError, match="vide"):
        ChatterboxMultilingualEngine("cpu").synthesize("  ", PROFIL)
