import json

import httpx
import pytest

from app.llm.ollama import FakeLlmClient, OllamaClient


async def _collecter(client, messages):
    return [m async for m in client.stream_chat(messages)]


async def test_fake_emet_mot_a_mot():
    fake = FakeLlmClient(["bonjour tout le monde"])
    assert await _collecter(fake, [{"role": "user", "content": "x"}]) == [
        "bonjour ", "tout ", "le ", "monde",
    ]


async def test_fake_memorise_les_messages_recus():
    fake = FakeLlmClient(["ok"])
    messages = [{"role": "user", "content": "contexte prospect"}]
    await _collecter(fake, messages)
    assert fake.derniers_messages == messages


async def test_ollama_agrege_les_lignes_ndjson():
    lignes = [
        json.dumps({"message": {"content": "Bon"}, "done": False}),
        json.dumps({"message": {"content": "jour"}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": True}),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, text="\n".join(lignes))

    transport = httpx.MockTransport(handler)
    client = OllamaClient("http://x", "modele", transport=transport)
    assert await _collecter(client, [{"role": "user", "content": "salut"}]) == ["Bon", "jour"]


async def test_ollama_ignore_les_lignes_vides():
    lignes = [json.dumps({"message": {"content": "A"}, "done": False}), "", "  "]
    transport = httpx.MockTransport(lambda r: httpx.Response(200, text="\n".join(lignes)))
    client = OllamaClient("http://x", "modele", transport=transport)
    assert await _collecter(client, [{"role": "user", "content": "s"}]) == ["A"]


async def test_ollama_leve_une_erreur_explicite_si_service_absent():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refus", request=request)

    transport = httpx.MockTransport(handler)
    client = OllamaClient("http://x", "modele", transport=transport)
    with pytest.raises(RuntimeError, match="Ollama"):
        await _collecter(client, [{"role": "user", "content": "s"}])
