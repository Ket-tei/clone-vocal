import pytest

from app.llm.ollama import FakeLlmClient
from app.meeting.brief import MeetingBrief
from app.meeting.script import KINDS, build_script_messages, generate_script, parse_script

BRIEF = MeetingBrief(
    prospect_name="Claire Martin",
    company="Acme SA",
    role="Directrice des achats",
    stake="Reduire les couts de traitement des factures",
    goal="Obtenir un second rendez-vous technique",
    expected_objections=["Le prix"],
    tone="direct et chiffre",
    target_duration_min=10,
)

BRUT = """[accroche]
Bonjour Claire, merci de votre temps.
[probleme]
Vos factures coutent cher a traiter.
[solution]
Notre outil automatise la saisie.
[preuve]
Un client a divise son delai par quatre.
[next_step]
On se cale un point technique ?"""

def test_le_prompt_contient_les_elements_du_brief():
    messages = build_script_messages(BRIEF)
    corps = " ".join(m["content"] for m in messages)
    assert "Claire Martin" in corps
    assert "Acme SA" in corps
    assert "Le prix" in corps
    assert "10" in corps

def test_le_prompt_impose_le_francais():
    corps = " ".join(m["content"] for m in build_script_messages(BRIEF))
    assert "francais" in corps.lower()

def test_parse_extrait_les_cinq_blocs():
    script = parse_script(BRUT)
    assert [b.kind for b in script.blocks] == list(KINDS)

def test_parse_conserve_le_texte():
    script = parse_script(BRUT)
    assert script.blocks[0].text == "Bonjour Claire, merci de votre temps."

def test_parse_ignore_une_balise_inconnue():
    script = parse_script("[inventee]\nTexte.\n[accroche]\nBonjour.")
    assert [b.kind for b in script.blocks] == ["accroche"]

def test_parse_sans_aucune_balise_leve_une_erreur():
    with pytest.raises(ValueError, match="aucun bloc"):
        parse_script("Du texte sans la moindre balise.")

def test_parse_deduplique_en_gardant_la_premiere_occurrence():
    script = parse_script("[accroche]\nPremiere.\n[accroche]\nSeconde.")
    assert [b.kind for b in script.blocks] == ["accroche"]
    assert script.blocks[0].text == "Premiere."

def test_parse_remet_les_blocs_dans_l_ordre_canonique():
    script = parse_script("[solution]\nNotre outil.\n[probleme]\nVos couts.")
    assert [b.kind for b in script.blocks] == ["probleme", "solution"]

def test_as_plain_text_joint_les_blocs_par_une_ligne_vide():
    """La tache 11 injecte ce texte dans le contexte du LLM."""
    script = parse_script(BRUT)
    texte = script.as_plain_text()
    assert "Bonjour Claire, merci de votre temps.\n\nVos factures" in texte
    assert "[accroche]" not in texte, "les balises ne doivent pas fuiter dans le prompt"

async def test_generate_script_assemble_le_flux():
    llm = FakeLlmClient([BRUT])
    script = await generate_script(llm, BRIEF)
    assert len(script.blocks) == 5
    assert script.blocks[4].kind == "next_step"

def test_parse_accepte_les_balises_en_markdown():
    """qwen3 8B ecrit parfois **accroche** au lieu de [accroche]."""
    brut = (
        "**accroche**  \nBonjour Claire.  \n\n"
        "**[probleme]**\nVos factures coutent cher.\n\n"
        "## solution :\nNotre outil automatise la saisie.\n\n"
        "**preuve**\nUn client a divise son delai par quatre.\n\n"
        "[next_step]\nOn se cale un point ?"
    )
    script = parse_script(brut)
    assert [b.kind for b in script.blocks] == list(KINDS)
    assert script.blocks[0].text == "Bonjour Claire."
