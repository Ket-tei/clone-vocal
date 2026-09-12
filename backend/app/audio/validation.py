from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

MIN_DUREE_S = 30.0
MAX_DUREE_S = 120.0
PEAK_MIN_DBFS = -18.0
PEAK_MAX_DBFS = -1.0
MAX_SILENCE_RATIO = 0.35
MIN_SNR_DB = 20.0

_SEUIL_SILENCE_DBFS = -50.0
_FENETRE_MS = 20


@dataclass(frozen=True)
class AudioMetrics:
    duration_s: float
    peak_dbfs: float
    silence_ratio: float
    snr_db: float


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    problems: list[str]


def _dbfs(x: float) -> float:
    return 20.0 * np.log10(max(float(x), 1e-10))


def analyze(path: Path) -> AudioMetrics:
    signal, sr = sf.read(str(path), dtype="float32", always_2d=True)
    mono = signal.mean(axis=1)
    duree = len(mono) / sr

    taille = max(1, int(sr * _FENETRE_MS / 1000))
    complet = len(mono) - (len(mono) % taille)
    fenetres = mono[:complet].reshape(-1, taille) if complet else mono.reshape(1, -1)
    rms = np.sqrt(np.mean(fenetres**2, axis=1))
    rms_db = np.array([_dbfs(v) for v in rms])

    silence = rms_db < _SEUIL_SILENCE_DBFS
    ratio_silence = float(silence.mean())

    actives = rms_db[~silence]
    if actives.size >= 2:
        plancher = float(np.percentile(actives, 10))
        utile = float(np.percentile(actives, 90))
        snr = utile - plancher
    else:
        snr = 0.0

    return AudioMetrics(
        duration_s=round(duree, 3),
        peak_dbfs=round(_dbfs(np.max(np.abs(mono)) if mono.size else 0.0), 2),
        silence_ratio=round(ratio_silence, 3),
        snr_db=round(snr, 2),
    )


def validate(metrics: AudioMetrics) -> ValidationResult:
    problems: list[str] = []
    if metrics.duration_s < MIN_DUREE_S:
        problems.append(
            f"Enregistrement trop court ({metrics.duration_s:.0f} s) : "
            f"enregistrez au moins {MIN_DUREE_S:.0f} secondes de parole continue, "
            "puis recommencez."
        )
    elif metrics.duration_s > MAX_DUREE_S:
        problems.append(
            f"Enregistrement trop long ({metrics.duration_s:.0f} s) : "
            f"limitez-vous à {MAX_DUREE_S:.0f} secondes maximum, coupez l'enregistrement "
            "plus tôt ou recommencez plus court."
        )
    if metrics.peak_dbfs > PEAK_MAX_DBFS:
        problems.append(
            "Le son est saturé : éloignez-vous du micro ou baissez le gain "
            "d'enregistrement, puis recommencez."
        )
    elif metrics.peak_dbfs < PEAK_MIN_DBFS:
        problems.append(
            "Le son est trop faible : rapprochez-vous du micro ou montez le gain."
        )
    if metrics.silence_ratio > MAX_SILENCE_RATIO:
        problems.append(
            f"Trop de silence ({metrics.silence_ratio:.0%}). Lisez le texte sans longues pauses."
        )
    if metrics.snr_db < MIN_SNR_DB:
        problems.append(
            "Trop de bruit de fond. Fermez les fenêtres et coupez ventilateur ou musique."
        )
    return ValidationResult(ok=not problems, problems=problems)
