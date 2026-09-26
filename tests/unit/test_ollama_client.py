"""Unit tests for the shared Ollama client (no Ollama server needed)."""

import pytest

from shared.llm.ollama_client import OllamaClient, OllamaError, OllamaResponseError


class FakeOllama:
    def __init__(self, content="ok", error=None):
        self.content = content
        self.error = error
        self.kwargs = None

    def chat(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return {"message": {"content": self.content}}


def make_client(fake: FakeOllama) -> OllamaClient:
    client = OllamaClient(model="qwen3:8b")
    client._client = fake
    return client


def test_json_mode_is_a_top_level_argument():
    fake = FakeOllama('{"a": 1}')
    assert make_client(fake).generate_text("p", system_instruction="s", json_output=True) == '{"a": 1}'
    assert fake.kwargs["format"] == "json"
    assert "format" not in fake.kwargs["options"]
    assert fake.kwargs["messages"] == [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "p"},
    ]


def test_plain_text_mode_sends_no_format():
    fake = FakeOllama()
    make_client(fake).generate_text("p")
    assert fake.kwargs["format"] is None


def test_thinking_is_disabled():
    fake = FakeOllama()
    make_client(fake).generate_text("p")
    assert fake.kwargs["think"] is False


def test_empty_response_raises():
    with pytest.raises(OllamaResponseError):
        make_client(FakeOllama("  ")).generate_text("p")


def test_server_error_is_wrapped():
    with pytest.raises(OllamaError):
        make_client(FakeOllama(error=ConnectionError("refused"))).generate_text("p")


def test_timeout_is_passed_to_the_http_client():
    assert OllamaClient(model="qwen3:8b", timeout=42)._client._client.timeout.read == 42


def test_a_timed_out_call_becomes_an_ollama_error():
    import httpx

    with pytest.raises(OllamaError):
        make_client(FakeOllama(error=httpx.ReadTimeout("slow"))).generate_text("p")
