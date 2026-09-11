import re

_ABREVIATIONS = {
    "m", "mm", "mme", "mlle", "dr", "pr", "me", "st", "ste",
    "etc", "cf", "ex", "env", "tel", "av", "bd",
}
_FINS = ".!?…"
_MOT_FINAL = re.compile(r"([A-Za-zÀ-ÿ]+)\.$")


class SentenceChunker:
    """Assemble un flux de fragments en phrases prononcables."""

    # Le seuil evite qu'un fragment trop court parte seul au TTS, ou il
    # sonnerait coupe. Il est borne par le comportement attendu : "Oui."
    # (4 car.) doit fusionner, "Bonjour a tous." (15 car.) doit sortir
    # seule. Toute valeur dans ]4, 15] convient ; au-dela de 15 les deux
    # cas deviennent indiscernables.
    def __init__(self, min_chars: int = 12) -> None:
        self.min_chars = min_chars
        self._tampon = ""

    def feed(self, fragment: str) -> list[str]:
        self._tampon += fragment
        pretes: list[str] = []
        while True:
            phrase = self._extraire()
            if phrase is None:
                return pretes
            pretes.append(phrase)

    def _extraire(self) -> str | None:
        for i, c in enumerate(self._tampon):
            if c not in _FINS:
                continue
            candidat = self._tampon[: i + 1]
            suivant = self._tampon[i + 1 : i + 2]
            if not suivant:
                # Ce signe est le dernier caractere du tampon : on ne peut pas
                # encore savoir s'il termine une phrase (". ") ou s'il est
                # interne (3.14). On attend le caractere suivant. En fin de
                # flux, c'est flush() qui rendra le reste.
                return None
            if not suivant.isspace():
                continue  # ex. 3.14 : le point est interne
            if len(candidat.strip()) < self.min_chars:
                continue  # fragment trop court, on le fusionne avec la suite
            if self._est_abreviation(candidat):
                continue
            self._tampon = self._tampon[i + 1 :].lstrip()
            return candidat.strip()
        return None

    @staticmethod
    def _est_abreviation(candidat: str) -> bool:
        m = _MOT_FINAL.search(candidat.strip())
        return bool(m) and m.group(1).lower() in _ABREVIATIONS

    def flush(self) -> str | None:
        reste = self._tampon.strip()
        self._tampon = ""
        return reste or None
