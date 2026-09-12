import numpy as np
import pytest
import soundfile as sf

from app.audio.validation import AudioMetrics, analyze, validate

SR = 24000

def _ecrire(tmp_path, signal, nom="e.wav"):
    chemin = tmp_path / nom
    sf.write(chemin, signal.astype(np.float32), SR)
    return chemin

def _parole(duree_s, amplitude=0.3):
    """Bruit module en amplitude : imite grossierement de la parole."""
    n = int(duree_s * SR)
    rng = np.random.default_rng(0)
    enveloppe = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / SR)
    return rng.normal(0, amplitude, n) * enveloppe

def _metriques(**kwargs):
    base = {"duration_s": 45.0, "peak_dbfs": -6.0, "silence_ratio": 0.1, "snr_db": 30.0}
    return AudioMetrics(**{**base, **kwargs})

def test_analyze_mesure_la_duree(tmp_path):
    chemin = _ecrire(tmp_path, _parole(2.0))
    assert analyze(chemin).duration_s == pytest.approx(2.0, abs=0.05)

def test_analyze_detecte_la_saturation(tmp_path):
    chemin = _ecrire(tmp_path, np.ones(SR) * 0.999)
    assert analyze(chemin).peak_dbfs > -1.0

def test_analyze_mesure_le_silence(tmp_path):
    signal = np.concatenate([_parole(1.0), np.zeros(SR)])
    assert analyze(_ecrire(tmp_path, signal)).silence_ratio == pytest.approx(0.5, abs=0.15)

def test_echantillon_conforme_est_accepte():
    assert validate(_metriques()).ok is True

def test_trop_court_est_refuse():
    resultat = validate(_metriques(duration_s=12.0))
    assert resultat.ok is False
    assert any("30" in p for p in resultat.problems)

def test_trop_long_est_refuse():
    assert validate(_metriques(duration_s=150.0)).ok is False

def test_sature_est_refuse():
    resultat = validate(_metriques(peak_dbfs=-0.2))
    assert any("saturé" in p.lower() for p in resultat.problems)

def test_trop_faible_est_refuse():
    resultat = validate(_metriques(peak_dbfs=-30.0))
    assert any("faible" in p.lower() for p in resultat.problems)

def test_trop_de_silence_est_refuse():
    assert validate(_metriques(silence_ratio=0.6)).ok is False

def test_trop_bruite_est_refuse():
    resultat = validate(_metriques(snr_db=9.0))
    assert any("bruit" in p.lower() for p in resultat.problems)

def test_plusieurs_problemes_sont_tous_listes():
    resultat = validate(_metriques(duration_s=5.0, snr_db=3.0))
    assert len(resultat.problems) == 2
