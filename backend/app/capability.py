import shutil
import subprocess
from dataclasses import dataclass


class InsufficientVramError(Exception):
    pass


@dataclass(frozen=True)
class ModelTier:
    name: str
    llm_model: str
    min_vram_gb: float


TIERS: list[ModelTier] = [
    ModelTier(name="haut", llm_model="qwen3:8b-q4_K_M", min_vram_gb=12.0),
    ModelTier(name="median", llm_model="qwen3:4b-q4_K_M", min_vram_gb=8.0),
]


def select_tier(vram_gb: float | None) -> ModelTier:
    if vram_gb is None:
        raise InsufficientVramError(
            "Aucun GPU NVIDIA détecté. Cette application exige une carte "
            "d'au moins 8 Go de VRAM."
        )
    for tier in TIERS:
        if vram_gb >= tier.min_vram_gb:
            return tier
    raise InsufficientVramError(
        f"VRAM détectée : {vram_gb} Go. Le minimum requis est 8.0 Go."
    )


def detect_vram_gb() -> float | None:
    if shutil.which("nvidia-smi") is None:
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    first = out.stdout.strip().splitlines()
    if not first:
        return None
    try:
        return round(int(first[0].strip()) / 1024, 1)
    except ValueError:
        return None
