import io
import wave
from typing import Protocol

import numpy as np

from app.voice.store import VoiceProfile

SAMPLE_RATE = 24000

class TtsEngine(Protocol):
    def synthesize(self, text: str, profile: VoiceProfile) -> bytes: ...

def _to_wav(signal: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    pcm = np.clip(signal, -1.0, 1.0)
    pcm = (pcm * 32767).astype(np.int16)
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return tampon.getvalue()

class FakeTtsEngine:
    """Doublure : produit un WAV silencieux proportionnel au texte. Sans GPU."""

    def __init__(self) -> None:
        self.appels: list[tuple[str, str]] = []

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte a synthetiser est vide.")
        self.appels.append((text, profile.id))
        duree = max(0.3, len(text) * 0.06)
        return _to_wav(np.zeros(int(duree * SAMPLE_RATE), dtype=np.float32))

class ChatterboxEngine:
    """Moteur reel. Charge le modele paresseusement : l'import coute cher."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._modele = None

    def _charger(self):
        if self._modele is None:
            from chatterbox.tts import ChatterboxTTS  # import tardif volontaire

            self._modele = ChatterboxTTS.from_pretrained(device=self.device)
        return self._modele

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte a synthetiser est vide.")
        modele = self._charger()
        onde = modele.generate(text, audio_prompt_path=profile.sample_path)
        signal = np.asarray(onde).squeeze().astype(np.float32)
        return _to_wav(signal, sr=getattr(modele, "sr", SAMPLE_RATE))

def get_engine(nom: str) -> TtsEngine:
    if nom == "fake":
        return FakeTtsEngine()
    if nom == "chatterbox":
        return ChatterboxEngine()
    raise ValueError(f"Moteur TTS inconnu : {nom!r}")
