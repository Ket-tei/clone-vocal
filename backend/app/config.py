from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Un .env dans le dossier de lancement suffit a configurer une nouvelle
    # machine (voir .env.example). Les variables d'environnement restent
    # prioritaires ; une cle inconnue dans le fichier ne bloque pas le demarrage.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    data_dir: Path = Path("data")
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_timeout_s: float = 120.0
    # Moteurs a utiliser. Les valeurs par defaut sont celles de production ;
    # "fake" permet de faire tourner l'application sur une machine sans GPU
    # (demonstration d'interface), ou la synthese rend un audio silencieux.
    tts_engine: str = "chatterbox"
    stt_engine: str = "kyutai"

    @property
    def voices_dir(self) -> Path:
        return self.data_dir / "voices"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.sqlite"

    def ensure_dirs(self) -> None:
        self.voices_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
