import pytest
from pydantic import ValidationError

from app.meeting.brief import MeetingBrief

VALIDE = {
    "prospect_name": "Claire Martin",
    "company": "Acme SA",
    "role": "Directrice des achats",
    "stake": "Reduire les couts de traitement des factures",
    "goal": "Obtenir un second rendez-vous technique",
    "expected_objections": ["Le prix", "Le delai de deploiement"],
    "tone": "direct et chiffre",
    "target_duration_min": 10,
}

def test_brief_valide_est_accepte():
    assert MeetingBrief(**VALIDE).company == "Acme SA"

def test_objections_par_defaut_vides():
    donnees = {k: v for k, v in VALIDE.items() if k != "expected_objections"}
    assert MeetingBrief(**donnees).expected_objections == []

def test_nom_de_prospect_vide_est_refuse():
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "prospect_name": "   "})

def test_objectif_obligatoire():
    donnees = {k: v for k, v in VALIDE.items() if k != "goal"}
    with pytest.raises(ValidationError):
        MeetingBrief(**donnees)

def test_duree_hors_bornes_est_refusee():
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "target_duration_min": 0})
    with pytest.raises(ValidationError):
        MeetingBrief(**{**VALIDE, "target_duration_min": 61})

def test_espaces_superflus_sont_retires():
    assert MeetingBrief(**{**VALIDE, "company": "  Acme SA  "}).company == "Acme SA"
