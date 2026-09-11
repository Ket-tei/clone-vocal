import subprocess
import types
from unittest.mock import MagicMock, patch

import pytest

from app.capability import InsufficientVramError, detect_vram_gb, select_tier

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


# Tests for detect_vram_gb()

def test_detect_vram_nvidia_smi_absent():
    """Quand nvidia-smi n'est pas dans le PATH, detect_vram_gb retourne None sans appeler subprocess.run."""
    with patch("app.capability.shutil.which", return_value=None) as mock_which:
        with patch("app.capability.subprocess.run") as mock_run:
            result = detect_vram_gb()
            assert result is None
            mock_which.assert_called_once_with("nvidia-smi")
            mock_run.assert_not_called()


def test_detect_vram_subprocess_failed():
    """Quand subprocess.run leve CalledProcessError, detect_vram_gb retourne None."""
    with patch("app.capability.shutil.which", return_value="/usr/bin/nvidia-smi"):
        with patch("app.capability.subprocess.run", side_effect=subprocess.CalledProcessError(1, "nvidia-smi")):
            result = detect_vram_gb()
            assert result is None


def test_detect_vram_subprocess_timeout():
    """Quand subprocess.run leve TimeoutExpired, detect_vram_gb retourne None."""
    with patch("app.capability.shutil.which", return_value="/usr/bin/nvidia-smi"):
        with patch("app.capability.subprocess.run", side_effect=subprocess.TimeoutExpired("nvidia-smi", 10)):
            result = detect_vram_gb()
            assert result is None


def test_detect_vram_empty_output():
    """Quand la sortie de nvidia-smi est vide, detect_vram_gb retourne None."""
    with patch("app.capability.shutil.which", return_value="/usr/bin/nvidia-smi"):
        mock_result = types.SimpleNamespace(stdout="")
        with patch("app.capability.subprocess.run", return_value=mock_result):
            result = detect_vram_gb()
            assert result is None


def test_detect_vram_non_numeric_output():
    """Quand la sortie de nvidia-smi n'est pas numerique, detect_vram_gb retourne None."""
    with patch("app.capability.shutil.which", return_value="/usr/bin/nvidia-smi"):
        mock_result = types.SimpleNamespace(stdout="N/A")
        with patch("app.capability.subprocess.run", return_value=mock_result):
            result = detect_vram_gb()
            assert result is None


def test_detect_vram_nominal():
    """Cas nominal : stdout vaut 12288 (Mio), detect_vram_gb retourne 12.0 (Go)."""
    with patch("app.capability.shutil.which", return_value="/usr/bin/nvidia-smi"):
        mock_result = types.SimpleNamespace(stdout="12288")
        with patch("app.capability.subprocess.run", return_value=mock_result):
            result = detect_vram_gb()
            assert result == 12.0
