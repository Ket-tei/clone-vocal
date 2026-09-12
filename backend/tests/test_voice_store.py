import sqlite3
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.audio.validation import AudioMetrics
from app.db import connect, init_schema
from app.voice.store import VoiceStore

METRIQUES = AudioMetrics(duration_s=45.0, peak_dbfs=-6.0, silence_ratio=0.1, snr_db=30.0)

@pytest.fixture
def store(tmp_path):
    conn = connect(tmp_path / "t.sqlite")
    init_schema(conn)
    voices = tmp_path / "voices"
    voices.mkdir()
    return VoiceStore(conn, voices)

def test_create_ecrit_le_fichier_et_la_ligne(store):
    profil = store.create("Ma voix", b"RIFFfake", METRIQUES)
    assert store.get(profil.id) == profil
    assert (store.voices_dir / f"{profil.id}.wav").read_bytes() == b"RIFFfake"

def test_create_reporte_les_metriques(store):
    profil = store.create("Ma voix", b"x", METRIQUES)
    assert profil.duration_s == 45.0
    assert profil.snr_db == 30.0
    assert profil.engine == "chatterbox"

def test_get_inconnu_renvoie_none(store):
    assert store.get("inexistant") is None

def test_list_est_trie_du_plus_recent_au_plus_ancien(store):
    a = store.create("A", b"x", METRIQUES)
    b = store.create("B", b"x", METRIQUES)
    assert [p.id for p in store.list()] == [b.id, a.id]

def test_delete_efface_vraiment_le_fichier(store):
    profil = store.create("Ma voix", b"x", METRIQUES)
    chemin = store.voices_dir / f"{profil.id}.wav"
    assert store.delete(profil.id) is True
    assert not chemin.exists()
    assert store.get(profil.id) is None

def test_delete_inconnu_renvoie_false(store):
    assert store.delete("inexistant") is False

def test_create_supprime_le_fichier_si_insert_echoue(store):
    mock_conn = MagicMock()
    mock_conn.execute.side_effect = sqlite3.Error("Simulated error")
    store.conn = mock_conn

    with pytest.raises(sqlite3.Error):
        store.create("Test", b"x", METRIQUES)

    # Vérifier qu'aucun fichier n'a été laissé orphelin
    assert len(list(store.voices_dir.glob("*.wav"))) == 0

def test_delete_conserve_la_ligne_si_le_fichier_resiste(store, monkeypatch):
    """Un .wav verrouille (sous Windows, un fichier encore ouvert par le moteur
    TTS suffit) ne doit pas laisser un echantillon biometrique orphelin,
    invisible et ineffacable depuis l'application. La ligne survit, donc le
    profil reste visible et l'utilisateur peut reessayer."""
    profil = store.create("Ma voix", b"x", METRIQUES)
    chemin = store.voices_dir / f"{profil.id}.wav"

    def unlink_impossible(self, missing_ok=False):
        raise PermissionError("fichier verrouille par un autre processus")

    monkeypatch.setattr(Path, "unlink", unlink_impossible)
    with pytest.raises(PermissionError):
        store.delete(profil.id)
    monkeypatch.undo()

    assert store.get(profil.id) is not None, (
        "la ligne doit survivre : sinon l'echantillon reste sur le disque "
        "sans aucun moyen de le retrouver"
    )
    assert chemin.exists()
    # Et une nouvelle tentative, elle, aboutit.
    assert store.delete(profil.id) is True
    assert not chemin.exists()
