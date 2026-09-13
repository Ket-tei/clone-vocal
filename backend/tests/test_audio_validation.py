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

def _lecture(crete_db=-20.0, bruit_db=-70.0, pauses=0.2, duree_s=40.0):
    """Lecture imitee : syllabes a 4 Hz, une pause a la fin de chaque phrase de
    2 s, le tout sur le bruit de fond d'une piece. Graine fixe : deux appels
    dont crete et bruit different du meme ecart donnent le meme son, a un gain pres."""
    rng = np.random.default_rng(0)
    n = int(duree_s * SR)
    t = np.arange(n) / SR
    parle = (t % 2.0) < 2.0 * (1 - pauses)
    voix = rng.normal(0, 1, n) * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)) * parle
    voix *= 10 ** (crete_db / 20) / np.max(np.abs(voix))
    return voix + rng.normal(0, 10 ** (bruit_db / 20), n)

def test_voix_basse_dans_une_piece_calme_est_acceptee(tmp_path):
    # Mesure sur une vraie voix : a -30 dBFS de crete, un plancher de silence
    # fixe a -50 dBFS comptait les syllabes comme du silence et refusait
    # l'enregistrement pour « silence » et « bruit » dans une piece calme.
    metriques = analyze(_ecrire(tmp_path, _lecture(crete_db=-30.0, bruit_db=-80.0)))
    assert validate(metriques).problems == []

def test_le_volume_ne_change_ni_le_silence_ni_le_bruit(tmp_path):
    fort = analyze(_ecrire(tmp_path, _lecture(crete_db=-6.0, bruit_db=-50.0), "fort.wav"))
    bas = analyze(_ecrire(tmp_path, _lecture(crete_db=-26.0, bruit_db=-70.0), "bas.wav"))
    assert bas.silence_ratio == pytest.approx(fort.silence_ratio, abs=0.02)
    assert bas.snr_db == pytest.approx(fort.snr_db, abs=0.5)

def test_piece_bruyante_refusee_pour_le_bruit_seulement(tmp_path):
    # Dans le bruit, les syllabes faibles passent sous le plancher de silence :
    # annoncer « trop de silence » enverrait l'utilisateur sur une fausse piste.
    problemes = validate(analyze(_ecrire(tmp_path, _lecture(bruit_db=-38.0)))).problems
    assert any("bruit" in p.lower() for p in problemes)
    assert not any("silence" in p.lower() for p in problemes)

def test_longues_pauses_sont_detectees(tmp_path):
    metriques = analyze(_ecrire(tmp_path, _lecture(crete_db=-12.0, pauses=0.5)))
    assert any("silence" in p.lower() for p in validate(metriques).problems)

def test_micro_coupe_est_entierement_du_silence(tmp_path):
    assert analyze(_ecrire(tmp_path, np.zeros(40 * SR))).silence_ratio == 1.0

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
    resultat = validate(_metriques(peak_dbfs=-35.0))
    assert any("faible" in p.lower() for p in resultat.problems)

def test_voix_posee_sans_gain_automatique_est_acceptee():
    # Le navigateur n'amplifie plus le micro : une voix posee culmine souvent
    # vers -25 dBFS, et meme en parlant fort il etait difficile d'atteindre
    # l'ancien seuil de -18.
    assert validate(_metriques(peak_dbfs=-25.0)).ok is True

def test_trop_de_silence_est_refuse():
    assert validate(_metriques(silence_ratio=0.6)).ok is False

def test_trop_bruite_est_refuse():
    resultat = validate(_metriques(snr_db=9.0))
    assert any("bruit" in p.lower() for p in resultat.problems)

def test_plusieurs_problemes_sont_tous_listes():
    resultat = validate(_metriques(duration_s=5.0, snr_db=3.0))
    assert len(resultat.problems) == 2
