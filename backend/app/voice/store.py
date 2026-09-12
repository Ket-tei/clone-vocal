import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.audio.validation import AudioMetrics

@dataclass(frozen=True)
class VoiceProfile:
    id: str
    label: str
    created_at: str
    sample_path: str
    duration_s: float
    snr_db: float
    peak_dbfs: float
    engine: str

class VoiceStore:
    def __init__(self, conn: sqlite3.Connection, voices_dir: Path) -> None:
        self.conn = conn
        self.voices_dir = voices_dir
        self.voices_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self, label: str, sample_bytes: bytes, metrics: AudioMetrics,
        engine: str = "chatterbox",
    ) -> VoiceProfile:
        profil_id = uuid.uuid4().hex
        chemin = self.voices_dir / f"{profil_id}.wav"
        chemin.write_bytes(sample_bytes)
        profil = VoiceProfile(
            id=profil_id,
            label=label,
            created_at=datetime.now(timezone.utc).isoformat(),
            sample_path=str(chemin),
            duration_s=metrics.duration_s,
            snr_db=metrics.snr_db,
            peak_dbfs=metrics.peak_dbfs,
            engine=engine,
        )
        try:
            self.conn.execute(
                "INSERT INTO voice_profiles (id, label, created_at, sample_path,"
                " duration_s, snr_db, peak_dbfs, engine)"
                " VALUES (:id, :label, :created_at, :sample_path,"
                " :duration_s, :snr_db, :peak_dbfs, :engine)",
                profil.__dict__,
            )
            self.conn.commit()
        except Exception:
            chemin.unlink(missing_ok=True)
            raise
        return profil

    def get(self, profil_id: str) -> VoiceProfile | None:
        row = self.conn.execute(
            "SELECT * FROM voice_profiles WHERE id = ?", (profil_id,)
        ).fetchone()
        return VoiceProfile(**dict(row)) if row else None

    def list(self) -> list[VoiceProfile]:
        rows = self.conn.execute(
            "SELECT * FROM voice_profiles ORDER BY created_at DESC, rowid DESC"
        ).fetchall()
        return [VoiceProfile(**dict(r)) for r in rows]

    def delete(self, profil_id: str) -> bool:
        profil = self.get(profil_id)
        if profil is None:
            return False
        # La revue demandait l'ordre inverse -- DELETE + commit, puis unlink --
        # pour qu'un echec ne laisse jamais de ligne pointant vers un fichier
        # absent. Cet ordre-la echange un defaut cosmetique contre une fuite :
        # si l'unlink echoue (sous Windows, un .wav encore ouvert par le moteur
        # TTS suffit), l'echantillon biometrique reste sur le disque SANS ligne
        # pour le designer, donc definitivement ineffacable depuis
        # l'application. C'est l'exact contraire de ce que promet le bouton
        # « supprimer ma voix ».
        #
        # Le DELETE est donc prepare mais pas valide : si l'unlink echoue on
        # annule, la ligne survit, le profil reste visible et une nouvelle
        # tentative reste possible. Seul le commit final sort de la
        # transaction -- fenetre irreductible sans validation en deux phases,
        # et dans cette fenetre le fichier est deja efface : il ne resterait
        # qu'une ligne fantome, que la suppression suivante nettoie.
        self.conn.execute("DELETE FROM voice_profiles WHERE id = ?", (profil_id,))
        try:
            Path(profil.sample_path).unlink(missing_ok=True)
        except OSError:
            self.conn.rollback()
            raise
        self.conn.commit()
        return True
