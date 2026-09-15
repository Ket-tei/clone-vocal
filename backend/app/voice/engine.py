import io
import threading
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

def _vers_signal(onde) -> np.ndarray:
    # Chatterbox rend un tenseur torch, potentiellement sur le GPU.
    # On le ramene en memoire hote sans importer torch : le duck typing
    # suffit et garde ce module utilisable sans la dependance.
    if hasattr(onde, "detach"):
        onde = onde.detach()
    if hasattr(onde, "cpu"):
        onde = onde.cpu()
    if hasattr(onde, "numpy"):
        onde = onde.numpy()
    return np.asarray(onde).squeeze().astype(np.float32)

class FakeTtsEngine:
    """Doublure : produit un WAV silencieux proportionnel au texte. Sans GPU."""

    modele_charge = True

    def __init__(self) -> None:
        self.appels: list[tuple[str, str]] = []

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte à synthétiser est vide.")
        self.appels.append((text, profile.id))
        duree = max(0.3, len(text) * 0.06)
        return _to_wav(np.zeros(int(duree * SAMPLE_RATE), dtype=np.float32))

class ChatterboxEngine:
    """Moteur reel. Charge le modele paresseusement : l'import coute cher."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._modele = None

    @property
    def modele_charge(self) -> bool:
        return self._modele is not None

    def _charger(self):
        if self._modele is None:
            from chatterbox.tts import ChatterboxTTS  # import tardif volontaire

            self._modele = ChatterboxTTS.from_pretrained(device=self.device)
        return self._modele

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte à synthétiser est vide.")
        modele = self._charger()
        onde = modele.generate(text, audio_prompt_path=profile.sample_path)
        return _to_wav(_vers_signal(onde), sr=getattr(modele, "sr", SAMPLE_RATE))

class ChatterboxMultilingualEngine:
    """Chatterbox multilingue, en francais : le modele de base est anglais et
    prononce le francais avec un fort accent."""

    def __init__(self, device: str = "cuda", langue: str = "fr") -> None:
        self.device = device
        self.langue = langue
        self._modele = None
        self._echantillon: str | None = None
        # La synthese tourne dans des threads (asyncio.to_thread) : un meme
        # modele et son empreinte vocale ne doivent servir qu'une phrase a la fois.
        self._verrou = threading.Lock()

    @property
    def modele_charge(self) -> bool:
        return self._modele is not None

    def _charger(self):
        if self._modele is None:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # import tardif volontaire

            self._modele = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        return self._modele

    def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        if not text.strip():
            raise ValueError("Le texte à synthétiser est vide.")
        with self._verrou:
            modele = self._charger()
            # L'empreinte de la voix coute plusieurs secondes sur CPU : on ne la
            # recalcule que lorsque l'echantillon change.
            if self._echantillon != profile.sample_path:
                modele.prepare_conditionals(profile.sample_path)
                self._echantillon = profile.sample_path
            onde = modele.generate(text, language_id=self.langue)
        return _to_wav(_vers_signal(onde), sr=getattr(modele, "sr", SAMPLE_RATE))

def get_engine(nom: str, device: str = "cuda") -> TtsEngine:
    if nom == "fake":
        return FakeTtsEngine()
    if nom == "chatterbox":
        return ChatterboxEngine(device)
    if nom == "chatterbox_mtl":
        return ChatterboxMultilingualEngine(device)
    raise ValueError(f"Moteur TTS inconnu : {nom!r}")
