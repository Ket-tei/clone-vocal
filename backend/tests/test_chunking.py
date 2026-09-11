from app.audio.chunking import SentenceChunker


def _tout(chunker, texte):
    """Alimente caractere par caractere : imite un flux de tokens."""
    phrases = []
    for c in texte:
        phrases.extend(chunker.feed(c))
    reste = chunker.flush()
    if reste:
        phrases.append(reste)
    return phrases


def test_phrase_simple():
    assert _tout(SentenceChunker(), "Bonjour a vous.") == ["Bonjour a vous."]


def test_deux_phrases_sont_separees():
    phrases = _tout(SentenceChunker(), "Bonjour a tous. Comment allez-vous ?")
    assert phrases == ["Bonjour a tous.", "Comment allez-vous ?"]


def test_abreviation_ne_coupe_pas():
    phrases = _tout(SentenceChunker(), "Je vois M. Dupont demain matin sans faute.")
    assert phrases == ["Je vois M. Dupont demain matin sans faute."]


def test_nombre_decimal_ne_coupe_pas():
    phrases = _tout(SentenceChunker(), "Le taux atteint 3.14 pour cent cette annee.")
    assert phrases == ["Le taux atteint 3.14 pour cent cette annee."]


def test_fragment_trop_court_est_fusionne():
    phrases = _tout(SentenceChunker(), "Oui. Absolument, je partage votre analyse.")
    assert phrases == ["Oui. Absolument, je partage votre analyse."]


def test_point_exclamation_coupe():
    phrases = _tout(SentenceChunker(), "C'est exactement notre sujet ! Regardons les chiffres.")
    assert len(phrases) == 2


def test_flush_rend_le_reste_sans_ponctuation():
    chunker = SentenceChunker()
    chunker.feed("Une phrase inachevee")
    assert chunker.flush() == "Une phrase inachevee"


def test_flush_vide_apres_coup():
    chunker = SentenceChunker()
    chunker.feed("Termine par un point final complet.")
    chunker.flush()
    assert chunker.flush() is None


def test_la_premiere_phrase_sort_avant_la_fin_du_flux():
    """Le coeur du streaming : ne pas attendre la fin pour parler."""
    chunker = SentenceChunker()
    sorties = chunker.feed("Voici la premiere phrase complete. Et la suite arrive")
    assert sorties == ["Voici la premiere phrase complete."]
