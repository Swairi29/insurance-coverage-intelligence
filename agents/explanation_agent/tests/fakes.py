"""Test doubles and fixture helpers for Agent 4 tests. Nothing here calls a real LLM."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Union

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> Any:
    """Load a JSON fixture, e.g. `load_fixture("bakery_mixed.json")`."""
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def load_llm_response(name: str) -> str:
    """Raw text of a canned LLM answer, e.g. `load_llm_response("bakery_mixed_good.json")`."""
    return (FIXTURES_DIR / "llm_responses" / name).read_text(encoding="utf-8")


def edge_case(name: str) -> dict:
    """The request body of one named case in `edge_cases.json`."""
    for case in load_fixture("edge_cases.json"):
        if case["name"] == name:
            return case["request"]
    raise KeyError(name)


@dataclass
class FakeCall:
    prompt: str
    system_instruction: Optional[str]
    json_output: bool


class FakeLLM:
    """Implements the `generate_text` protocol of `GeminiClient` / `OllamaClient`.

    Each call returns (or raises) the next item of `responses`. Calling it more
    times than there are responses raises `AssertionError`, so tests notice
    unexpected LLM calls.
    """

    def __init__(self, responses: List[Union[str, Exception]]) -> None:
        self._responses = list(responses)
        self.calls: List[FakeCall] = []

    @property
    def prompts(self) -> List[str]:
        return [call.prompt for call in self.calls]

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        json_output: bool = False,
    ) -> str:
        self.calls.append(FakeCall(prompt, system_instruction, json_output))
        if not self._responses:
            raise AssertionError("FakeLLM received more calls than it has responses.")
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response
