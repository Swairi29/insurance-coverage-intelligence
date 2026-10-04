"""Run one analysis through the gateway and wait for it, for the scripts.

`POST /api/v1/analyses` answers 202 at once and runs the agents in the
background, so a caller polls `GET /api/v1/analyses/{id}/status` until the run
is no longer "running", then fetches the result. Works with `httpx.Client` and
FastAPI's `TestClient` (whose background tasks finish before the POST returns).
"""

from __future__ import annotations

import time
from typing import Optional

import httpx

POLL_SECONDS = 1.5


class AnalysisError(Exception):
    """The analysis could not be started or did not finish; `response` says why."""

    def __init__(self, message: str, response: Optional[httpx.Response] = None,
                 progress: Optional[dict] = None):
        super().__init__(message)
        self.response = response
        self.progress = progress


def run_analysis(client, headers: dict, body: dict, *, timeout_seconds: float = 700) -> dict:
    """Start an analysis, wait until it finishes, and return the `AnalysisResponse` body.

    Raises `AnalysisError` if it cannot start, fails, or takes longer than `timeout_seconds`.
    """
    started = client.post("/api/v1/analyses", headers=headers, json=body)
    if started.status_code != 202:
        raise AnalysisError("the analysis could not be started", response=started)
    request_id = started.json()["request_id"]

    deadline = time.monotonic() + timeout_seconds
    while True:
        status = client.get(f"/api/v1/analyses/{request_id}/status", headers=headers)
        if status.status_code != 200:
            raise AnalysisError("the analysis status could not be read", response=status)
        progress = status.json()
        if progress["state"] == "failed":
            raise AnalysisError("the analysis failed", response=status, progress=progress)
        if progress["state"] != "running":
            break
        if time.monotonic() > deadline:
            raise AnalysisError(f"the analysis did not finish within {timeout_seconds:g} s",
                                progress=progress)
        time.sleep(POLL_SECONDS)

    result = client.get(f"/api/v1/analyses/{request_id}", headers=headers)
    if result.status_code != 200:
        raise AnalysisError("the finished analysis could not be read", response=result)
    return result.json()
