import re

_ABREVIATIONS = {
    "m", "mm", "mme", "mlle", "dr", "pr", "me", "st", "ste",
    "etc", "cf", "ex", "env", "tel", "av", "bd",
}
_FINS = ".!?…"
_FERMANTS = "\"»)]'”’"
_MOT_FINAL = re.compile(r"([A-Za-zÀ-ÿ]+)\.$")


class SentenceChunker:
    """Assemble un flux de fragments en phrases prononcables."""

    # Le seuil evite qu'un fragment trop court parte seul au TTS, ou il
    # sonnerait coupe. Il est borne par le comportement attendu : "Oui."
    # (4 car.) doit fusionner, "Bonjour a tous." (15 car.) doit sortir
    # seule. Toute valeur dans ]4, 15] convient ; au-dela de 15 les deux
    # cas deviennent indiscernables.
    # max_chars est un filet de securite, pas une regle de segmentation : un
    # flux sans ponctuation terminale (enumeration, liste a puces, tirets)
    # ferait sinon grossir le tampon indefiniment et recreerait le silence
    # que ce composant existe pour supprimer.
    def __init__(self, min_chars: int = 12, max_chars: int = 400) -> None:
        self.min_chars = min_chars
        self.max_chars = max_chars
        self._tampon = ""

    def feed(self, fragment: str) -> list[str]:
        self._tampon += fragment
        pretes: list[str] = []
        while True:
            phrase = self._extraire()
            if phrase is None:
                break
            pretes.append(phrase)
        while len(self._tampon) > self.max_chars:
            # Coupe d'urgence sur le dernier espace avant la limite. S'il n'y
            # a aucun espace (mot unique geant), c'est un cas pathologique :
            # on n'emet rien et on laisse le tampon deborder.
            idx_espace = self._tampon[: self.max_chars].rfind(" ")
            if idx_espace <= 0:
                break
            morceau = self._tampon[:idx_espace].strip()
            self._tampon = self._tampon[idx_espace:].lstrip()
            if morceau:
                pretes.append(morceau)
        return pretes

    def _extraire(self) -> str | None:
        for i, c in enumerate(self._tampon):
            if c not in _FINS:
                continue
            fin = i + 1
            while fin < len(self._tampon) and self._tampon[fin] in _FERMANTS:
                fin += 1
            candidat = self._tampon[:fin]
            suivant = self._tampon[fin : fin + 1]
            if not suivant:
                # Ce signe (et les guillemets/parentheses fermants qui le
                # suivent eventuellement) est en bout de tampon : on ne peut
                # pas encore savoir s'il termine une phrase (". ") ou s'il
                # est interne (3.14). On attend le caractere suivant. En fin
                # de flux, c'est flush() qui rendra le reste.
                return None
            if not suivant.isspace():
                continue  # ex. 3.14 : le point est interne
            if len(candidat.strip()) < self.min_chars:
                continue  # fragment trop court, on le fusionne avec la suite
            if self._est_abreviation(candidat):
                continue
            self._tampon = self._tampon[fin:].lstrip()
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
