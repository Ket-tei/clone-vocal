import json
from collections.abc import AsyncIterator
from typing import Protocol, TypedDict

import httpx


class Message(TypedDict):
    role: str
    content: str


class LlmClient(Protocol):
    def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]: ...


class OllamaClient:
    def __init__(
        self, base_url: str, model: str, timeout_s: float = 120.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self._transport = transport

    async def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]:
        charge = {"model": self.model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_s, transport=self._transport
            ) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=charge
                ) as reponse:
                    reponse.raise_for_status()
                    async for ligne in reponse.aiter_lines():
                        if not ligne.strip():
                            continue
                        try:
                            bloc = json.loads(ligne)
                        except json.JSONDecodeError as err:
                            raise RuntimeError(
                                "Reponse illisible d'Ollama : le flux a ete "
                                "interrompu ou le service a redemarre en "
                                "cours de generation."
                            ) from err
                        morceau = bloc.get("message", {}).get("content", "")
                        if morceau:
                            yield morceau
                        if bloc.get("done"):
                            return
        except httpx.HTTPError as err:
            raise RuntimeError(
                f"Ollama est injoignable sur {self.base_url}. "
                f"Lancez-le avec : ollama serve"
            ) from err


class FakeLlmClient:
    def __init__(self, reponses: list[str]) -> None:
        self._reponses = list(reponses)
        self.derniers_messages: list[Message] = []

    async def stream_chat(self, messages: list[Message]) -> AsyncIterator[str]:
        self.derniers_messages = messages
        texte = self._reponses.pop(0) if self._reponses else ""
        if not texte:
            return
        mots = texte.split(" ")
        for i, mot in enumerate(mots):
            yield mot if i == len(mots) - 1 else mot + " "
