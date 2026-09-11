import pytest

from app.capability import InsufficientVramError, select_tier

def test_16_go_donne_le_palier_haut():
    assert select_tier(16.0).llm_model == "qwen3:8b-q4_K_M"

def test_12_go_pile_donne_le_palier_haut():
    assert select_tier(12.0).llm_model == "qwen3:8b-q4_K_M"

def test_10_go_donne_le_palier_median():
    assert select_tier(10.0).llm_model == "qwen3:4b-q4_K_M"

def test_8_go_pile_donne_le_palier_median():
    assert select_tier(8.0).llm_model == "qwen3:4b-q4_K_M"

def test_sous_8_go_refuse():
    with pytest.raises(InsufficientVramError) as err:
        select_tier(6.0)
    assert "6.0" in str(err.value)

def test_vram_inconnue_refuse():
    with pytest.raises(InsufficientVramError):
        select_tier(None)
