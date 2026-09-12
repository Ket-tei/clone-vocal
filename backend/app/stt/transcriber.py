import tempfile
from pathlib import Path
from typing import Protocol

MODELE_KYUTAI = "kyutai/stt-1b-en_fr"

class Transcriber(Protocol):
    def transcribe(self, wav_bytes: bytes) -> str: ...

class FakeTranscriber:
    """Doublure : depile ses reponses dans l'ordre, sans GPU."""

    def __init__(self, reponses: list[str]) -> None:
        self._reponses = list(reponses)
        self.appels = 0

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio recu est vide.")
        self.appels += 1
        return self._reponses.pop(0) if self._reponses else ""

class KyutaiTranscriber:
    """STT Kyutai en process, par lot. Le tour par tour rend le streaming inutile."""

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._modele = None

    def _charger(self):
        if self._modele is None:
            from moshi.models import loaders  # import tardif volontaire

            self._modele = loaders.get_stt_model(MODELE_KYUTAI, device=self.device)
        return self._modele

    def transcribe(self, wav_bytes: bytes) -> str:
        if not wav_bytes:
            raise ValueError("L'audio recu est vide.")
        modele = self._charger()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            chemin = Path(f.name)
        try:
            # f est deja referme ici (fin du bloc with) : sous Windows, un
            # NamedTemporaryFile(delete=False) reste verrouille tant qu'il
            # n'est pas explicitement ferme, et la bibliotheque de
            # transcription ne pourrait pas le relire.
            texte = modele.transcribe_file(str(chemin))
            # On ne suppose pas le type de retour d'une bibliotheque qu'on ne
            # peut pas inspecter sans GPU : conversion defensive en str.
            return str(texte).strip()
        finally:
            chemin.unlink(missing_ok=True)

def get_transcriber(nom: str) -> Transcriber:
    if nom == "fake":
        return FakeTranscriber([])
    if nom == "kyutai":
        return KyutaiTranscriber()
    raise ValueError(f"Moteur de transcription inconnu : {nom!r}")
