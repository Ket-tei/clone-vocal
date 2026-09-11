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
    """Le coeur du streaming : la phrase sort avant que la suite n'existe."""
    chunker = SentenceChunker()
    premier = chunker.feed("Voici la premiere phrase complete. ")
    assert premier == ["Voici la premiere phrase complete."]
    assert chunker.feed("Et la suite arrive") == []
    assert chunker.flush() == "Et la suite arrive"


def test_citation_fermee_coupe_bien():
    phrases = _tout(SentenceChunker(), 'Il a dit : "Bonjour." Puis il est parti.')
    assert phrases == ['Il a dit : "Bonjour."', "Puis il est parti."]


def test_flux_sans_ponctuation_finit_par_sortir():
    chunker = SentenceChunker(max_chars=50)
    phrases = chunker.feed("mot " * 30)
    assert phrases, "un flux sans ponctuation doit finir par emettre"
    assert all(len(p) <= 50 for p in phrases)


def test_la_coupe_forcee_tombe_sur_un_espace():
    chunker = SentenceChunker(max_chars=50)
    for phrase in chunker.feed("alpha beta gamma delta epsilon zeta eta theta iota kappa"):
        assert not phrase.endswith(" ")
        assert " " in phrase or len(phrase) < 50
