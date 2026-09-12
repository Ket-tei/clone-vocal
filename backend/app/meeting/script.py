import re

from pydantic import BaseModel

from app.llm.ollama import LlmClient, Message
from app.meeting.brief import MeetingBrief

KINDS: tuple[str, ...] = ("accroche", "probleme", "solution", "preuve", "next_step")
_BALISE = re.compile(r"^\[([a-z_]+)\]\s*$", re.MULTILINE)


class ScriptBlock(BaseModel):
    kind: str
    text: str


class Script(BaseModel):
    blocks: list[ScriptBlock]

    def as_plain_text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)


_SYSTEME = (
    "Tu rediges le script oral d'un commercial pour un rendez-vous de prospection. "
    "Tu ecris exclusivement en francais, dans un style parle et naturel, destine a "
    "etre prononce a voix haute. Pas de listes a puces, pas de titres, pas de "
    "markdown : uniquement des phrases que l'on peut dire. "
    "Structure ta reponse en exactement cinq blocs, dans cet ordre : "
    + " ".join(f"[{k}]" for k in KINDS)
    + ". Fais preceder chaque bloc de sa balise seule sur sa ligne."
)


def build_script_messages(brief: MeetingBrief) -> list[Message]:
    objections = ", ".join(brief.expected_objections) or "aucune identifiee"
    utilisateur = (
        f"Prospect : {brief.prospect_name}, {brief.role or 'fonction non precisee'} "
        f"chez {brief.company}.\n"
        f"Enjeu du prospect : {brief.stake}\n"
        f"Objectif du rendez-vous : {brief.goal}\n"
        f"Objections attendues : {objections}\n"
        f"Ton souhaite : {brief.tone}\n"
        f"Duree cible : {brief.target_duration_min} minutes."
    )
    return [
        {"role": "system", "content": _SYSTEME},
        {"role": "user", "content": utilisateur},
    ]


def parse_script(brut: str) -> Script:
    morceaux = _BALISE.split(brut)
    par_kind: dict[str, str] = {}
    for i in range(1, len(morceaux) - 1, 2):
        kind = morceaux[i].strip()
        texte = morceaux[i + 1].strip()
        # Un LLM local peut repeter ou reordonner une balise ; le script etant
        # prononce dans l'ordre, on normalise (premiere occurrence, ordre canonique)
        # plutot que de jeter une generation entiere pour un defaut mineur.
        if kind in KINDS and texte and kind not in par_kind:
            par_kind[kind] = texte
    if not par_kind:
        raise ValueError(
            "Le modele n'a produit aucun bloc exploitable. Relancez la generation."
        )
    blocks = [ScriptBlock(kind=k, text=par_kind[k]) for k in KINDS if k in par_kind]
    return Script(blocks=blocks)


async def generate_script(llm: LlmClient, brief: MeetingBrief) -> Script:
    morceaux: list[str] = []
    async for morceau in llm.stream_chat(build_script_messages(brief)):
        morceaux.append(morceau)
    return parse_script("".join(morceaux))
