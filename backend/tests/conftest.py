from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Le gestionnaire de contexte est obligatoire : sans lui, Starlette n'émet
    # jamais le scope lifespan et le démarrage de l'application ne s'exécute pas.
    with TestClient(app) as testeur:
        yield testeur
