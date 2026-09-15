from typing import Protocol

MODELE_KYUTAI = "kyutai/stt-1b-en_fr-trfs"

class Transcriber(Protocol):
    def transcribe(self, wav_bytes: bytes) -> str: ...

class FakeTranscriber:
    """Doublure : depile ses reponses dans l'ordre, sans GPU."""

    def __init__(self, reponses: list[str]) -> None:
        self._reponses = list(reponses)
        self.appels = 0

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio reçu est vide.")
        self.appels += 1
        return self._reponses.pop(0) if self._reponses else ""

class KyutaiTranscriber:
    """STT Kyutai en process, par lot, via transformers (GPU ou CPU)."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._processeur = None
        self._modele = None

    def _charger(self):
        if self._modele is None:
            # Import tardif volontaire : transformers et torch coutent cher.
            from transformers import (
                KyutaiSpeechToTextForConditionalGeneration,
                KyutaiSpeechToTextProcessor,
            )

            self._processeur = KyutaiSpeechToTextProcessor.from_pretrained(MODELE_KYUTAI)
            self._modele = KyutaiSpeechToTextForConditionalGeneration.from_pretrained(
                MODELE_KYUTAI, torch_dtype="auto"
            ).to(self.device)
        return self._processeur, self._modele

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio reçu est vide.")
        import io

        import numpy as np
        import soundfile as sf

        processeur, modele = self._charger()
        signal, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32", always_2d=True)
        signal = signal.mean(axis=1)
        taux = processeur.feature_extractor.sampling_rate
        if sr != taux:
            import librosa

            signal = librosa.resample(signal, orig_sr=sr, target_sr=taux)
        entrees = processeur(audio=np.asarray(signal, dtype=np.float32)).to(modele.device)
        jetons = modele.generate(**entrees)
        texte = processeur.batch_decode(jetons, skip_special_tokens=True)
        return (texte[0] if texte else "").strip()

def get_transcriber(nom: str, device: str = "cuda") -> Transcriber:
    if nom == "fake":
        return FakeTranscriber([])
    if nom == "kyutai":
        return KyutaiTranscriber(device)
    raise ValueError(f"Moteur de transcription inconnu : {nom!r}")
