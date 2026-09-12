import pytest

from app.stt.transcriber import FakeTranscriber, KyutaiTranscriber, get_transcriber


def test_fake_rend_les_reponses_dans_l_ordre():
    t = FakeTranscriber(["Quel est le prix ?", "Et le delai ?"])
    assert t.transcribe(b"RIFF") == "Quel est le prix ?"
    assert t.transcribe(b"RIFF") == "Et le delai ?"

def test_fake_compte_les_appels():
    t = FakeTranscriber(["a", "b"])
    t.transcribe(b"x")
    assert t.appels == 1

def test_fake_epuise_rend_une_chaine_vide():
    t = FakeTranscriber(["seule"])
    t.transcribe(b"x")
    assert t.transcribe(b"x") == ""

def test_audio_vide_est_refuse():
    with pytest.raises(ValueError, match="vide"):
        FakeTranscriber(["a"]).transcribe(b"")

def test_get_transcriber_inconnu_est_refuse():
    with pytest.raises(ValueError, match="inconnu"):
        get_transcriber("inexistant")

def test_kyutai_refuse_un_audio_vide_sans_charger_le_modele(monkeypatch):
    """Charger le modele pour refuser zero octet serait absurde."""
    transcripteur = KyutaiTranscriber()

    def _interdit():
        raise AssertionError("le modele ne doit pas etre charge")

    monkeypatch.setattr(transcripteur, "_charger", _interdit)
    with pytest.raises(ValueError, match="vide"):
        transcripteur.transcribe(b"")
