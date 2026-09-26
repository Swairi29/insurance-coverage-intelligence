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

    # --- Explanation & Recommendation (Agent 4) ---
    # False = the report uses standard template wording only, and no LLM is called.
    explanation_use_llm: bool = True
    # Time Agent 4 may spend on LLM wording per report. No new batch starts after
    # it, and each Ollama call is limited to it; unfinished findings get template
    # wording. Keep it under half of EXPLANATION_TIMEOUT_SECONDS so the report
    # always reaches the gateway before the gateway gives up.
    explanation_llm_budget_seconds: float = Field(default=280.0, gt=0)

    # --- Orchestration gateway ---
    # 127.0.0.1 rather than localhost: on Windows "localhost" tries IPv6 first
    # and adds ~2 s per call, because uvicorn only listens on IPv4.
    risk_agent_url: str = "http://127.0.0.1:8001"
    policy_agent_url: str = "http://127.0.0.1:8002"
    coverage_agent_url: str = "http://127.0.0.1:8003"
    explanation_agent_url: str = "http://127.0.0.1:8004"
    # Per-call timeout for Agents 1-3, and a longer one for Agent 4, because a
    # local model on CPU can take minutes to write a large report.
    request_timeout_seconds: float = Field(default=60.0, gt=0)
    explanation_timeout_seconds: float = Field(default=600.0, gt=0)
    # SQLite file for users, uploaded policies and analysis runs.
    database_path: str = "./data/app.db"

    # --- Security ---
    # Shared secret required in the `X-API-Key` header for inter-agent calls.
    internal_api_key: Optional[SecretStr] = None
    # Fernet key used to encrypt uploaded policy PDFs (and stored analysis results) at rest.
    document_encryption_key: Optional[SecretStr] = None
    # Signs the gateway's login tokens (JWT, HS256). Without it, login is refused.
    jwt_secret_key: Optional[SecretStr] = None
    jwt_expiry_minutes: int = Field(default=60, gt=0, le=24 * 60)

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
