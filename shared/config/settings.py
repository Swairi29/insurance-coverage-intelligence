"""Shared application settings.

Values come from environment variables, or from a local `.env` file (which is
gitignored). Nothing secret is ever hardcoded here.

Only the LLM settings exist so far. Other teams can add their own fields to
`Settings`; unknown variables in `.env` are ignored.
"""

from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # `GEMINI_API_KEY=` (empty) behaves the same as not setting it.
        env_ignore_empty=True,
    )

    # --- LLM provider ---
    # "gemini" uses the Google Gemini API.
    # "ollama" uses a locally hosted Ollama model.
    llm_provider: Literal["gemini", "ollama"] = "gemini"

    # --- Google Gemini ---
    # SecretStr hides the API key in logs, repr() and tracebacks.
    gemini_api_key: Optional[SecretStr] = None
    llm_model: Optional[str] = None

    # --- Local Ollama ---
    ollama_model: str = "qwen3:8b"
    ollama_host: str = "http://localhost:11434"

    # --- Shared LLM generation settings ---
    llm_max_tokens: int = Field(default=4096, gt=0)
    llm_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=30.0, gt=0)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
   
    # --- Documents & retrieval (Agent 2) ---
    upload_dir: str = "./data/uploads"
    processed_dir: str = "./data/processed"
    vector_store_dir: str = "./data/index"  # reserved for a future semantic-search pass
    chunk_size: int = Field(default=800, gt=0)
    chunk_overlap: int = Field(default=120, ge=0)
    retrieval_top_k: int = Field(default=8, gt=0)
    max_upload_mb: int = Field(default=25, gt=0)
    # OCR needs the separate Tesseract program installed on the machine; this
    # lets a deployment without it turn OCR off instead of failing per page.
    ocr_enabled: bool = True
    # Full path to tesseract.exe, only needed if it is not already on PATH.
    tesseract_cmd: Optional[str] = None
    # "tfidf" (default, keyword-based) or "semantic" (embedding-based, ChromaDB).
    retrieval_backend: Literal["tfidf", "semantic"] = "tfidf"

    # --- Security ---
    # Shared secret required in the `X-API-Key` header for inter-agent calls.
    internal_api_key: Optional[SecretStr] = None
    # Fernet key used to encrypt uploaded policy PDFs at rest.
    document_encryption_key: Optional[SecretStr] = None

    @property
    def llm_is_configured(self) -> bool:
        """True when the selected LLM provider is configured."""
        if self.llm_provider == "ollama":
            return bool(
                self.ollama_model.strip()
                and self.ollama_host.strip()
            )

        key = (
            self.gemini_api_key.get_secret_value().strip()
            if self.gemini_api_key
            else ""
        )

        return bool(key and (self.llm_model or "").strip())


@lru_cache
def get_settings() -> Settings:
    """Load settings once and reuse them."""
    return Settings()
