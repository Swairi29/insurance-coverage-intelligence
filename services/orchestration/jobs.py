"""Analyses that are running in the background, and their progress per agent.

`POST /api/v1/analyses` answers 202 straight away and the pipeline runs in a
background task. While it runs, the gateway records each agent call here, so
`GET /api/v1/analyses/{id}/status` can show which agent is working and what
was handed over (counts only, never business or policy content).

In memory, per gateway process. A finished run is also saved to the database,
so after a restart its status is rebuilt from the saved analysis instead.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Callable, Dict, Optional

from services.orchestration.pipeline import ANALYSIS_STAGES, STAGE_AGENTS, STAGE_PATHS, Stage
from shared.schemas.responses import (
    AnalysisProgress,
    AnalysisResponse,
    AnalysisStatus,
    GatewayError,
    RunState,
    StageProgress,
    StageState,
)

# How long a finished run stays in memory (it is in the database anyway).
KEEP_FINISHED_SECONDS = 60 * 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _queued_stages() -> list:
    return [
        StageProgress(stage=stage.value, agent=STAGE_AGENTS[stage], endpoint=f"POST {STAGE_PATHS[stage]}")
        for stage in ANALYSIS_STAGES
    ]


@dataclass
class Job:
    user_id: str
    progress: AnalysisProgress
    result: Optional[AnalysisResponse] = None
    finished_at: Optional[float] = None  # monotonic


class JobStore:
    def __init__(self, keep_finished_seconds: float = KEEP_FINISHED_SECONDS,
                 clock: Callable[[], float] = time.monotonic):
        self._jobs: Dict[str, Job] = {}
        self._keep = keep_finished_seconds
        self._clock = clock
        self._lock = threading.Lock()

    # --- lifecycle --------------------------------------------------------------------------

    def create(self, request_id: str, user_id: str) -> AnalysisProgress:
        now = _now()
        progress = AnalysisProgress(request_id=request_id, state=RunState.RUNNING, created_at=now,
                                    updated_at=now, stages=_queued_stages())
        with self._lock:
            self._prune()
            self._jobs[request_id] = Job(user_id=user_id, progress=progress)
            return progress.model_copy(deep=True)

    def reporter(self, request_id: str) -> "JobReporter":
        return JobReporter(self, request_id)

    def complete(self, request_id: str, result: AnalysisResponse) -> None:
        state = RunState.COMPLETE if result.status is AnalysisStatus.COMPLETE else RunState.PARTIAL
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None:
                return
            job.result = result
            job.progress.state = state
            job.progress.updated_at = _now()
            job.finished_at = self._clock()

    def fail(self, request_id: str, error: GatewayError) -> None:
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None:
                return
            now = _now()
            for stage in job.progress.stages:
                if stage.state is StageState.RUNNING:
                    # Still running when the run ended: the crash happened in this stage.
                    # (Agent errors are marked failed by the pipeline before this is called.)
                    stage.state = StageState.FAILED
                    stage.received = "Unexpected error"
                    stage.finished_at = now
                    if stage.started_at:
                        stage.duration_ms = int((now - stage.started_at).total_seconds() * 1000)
                elif stage.state is StageState.QUEUED:
                    stage.state = StageState.SKIPPED
                    stage.received = "Skipped: an earlier agent failed"
            job.progress.state = RunState.FAILED
            job.progress.error = error
            job.progress.updated_at = _now()
            job.finished_at = self._clock()

    # --- reading ----------------------------------------------------------------------------

    def get(self, request_id: str, user_id: str) -> Optional[Job]:
        """A copy of the user's job, or None (also when it belongs to someone else)."""
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None or job.user_id != user_id:
                return None
            return Job(user_id=job.user_id, progress=job.progress.model_copy(deep=True),
                       result=job.result, finished_at=job.finished_at)

    # --- stage updates (called from the background task) -----------------------------------------

    def _update(self, request_id: str, stage: Stage, **changes) -> None:
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None:
                return
            entry = next(s for s in job.progress.stages if s.stage == stage.value)
            now = _now()
            state = changes.get("state")
            if state is StageState.RUNNING:
                entry.started_at = now
            elif state in (StageState.DONE, StageState.FAILED) and entry.started_at:
                entry.finished_at = now
                entry.duration_ms = int((now - entry.started_at).total_seconds() * 1000)
            for name, value in changes.items():
                setattr(entry, name, value)
            job.progress.updated_at = now

    def _prune(self) -> None:
        cutoff = self._clock() - self._keep
        for request_id in [rid for rid, job in self._jobs.items()
                           if job.finished_at is not None and job.finished_at < cutoff]:
            del self._jobs[request_id]


class JobReporter:
    """The pipeline's `ProgressReporter` for one job."""

    def __init__(self, store: JobStore, request_id: str):
        self._store = store
        self._request_id = request_id

    def started(self, stage: Stage, sent: str) -> None:
        self._store._update(self._request_id, stage, state=StageState.RUNNING, sent=sent)

    def finished(self, stage: Stage, received: str) -> None:
        self._store._update(self._request_id, stage, state=StageState.DONE, received=received)

    def failed(self, stage: Stage, reason: str) -> None:
        self._store._update(self._request_id, stage, state=StageState.FAILED, received=reason)

    def skipped(self, stage: Stage, reason: str) -> None:
        self._store._update(self._request_id, stage, state=StageState.SKIPPED, received=reason)


@lru_cache
def get_job_store() -> JobStore:
    return JobStore()


def _plural(number: int, noun: str) -> str:
    return f"{number} {noun}{'' if number == 1 else 's'}"


def progress_from_analysis(analysis: AnalysisResponse) -> AnalysisProgress:
    """The status of a saved analysis (after a restart, or once its job has been pruned).

    The saved result holds each agent's duration (`stage_ms`) and the time the run finished
    (`created_at`), so the timeline is rebuilt backwards from the end: the workspace then shows
    the same agents, handoffs and timings as during the run. Summaries are counts only.
    """
    assessments = analysis.coverage.assessments
    risks = len(analysis.risk_profile.risks)
    clauses = len({c.chunk_id for a in assessments for c in a.evidence})
    policies = len({c.policy_id for a in assessments for c in a.evidence})
    gaps = sum(1 for a in assessments if a.potential_gap)

    sent = {
        Stage.RISK_PROFILE: "business profile",
        # The policies whose clauses were used (the policy_ids sent are not saved).
        Stage.POLICY_EVIDENCE: f"{_plural(risks, 'risk')}, {policies} "
                               f"polic{'y' if policies == 1 else 'ies'} with matching wording",
        Stage.COVERAGE: f"{_plural(risks, 'risk')} + {_plural(clauses, 'clause')}",
        Stage.REPORT: _plural(len(assessments), "assessment"),
    }
    received = {
        Stage.RISK_PROFILE: f"{_plural(risks, 'risk')} identified",
        Stage.POLICY_EVIDENCE: f"{_plural(clauses, 'clause')} found",
        Stage.COVERAGE: f"{_plural(len(assessments), 'risk')} assessed, {_plural(gaps, 'potential gap')}",
        Stage.REPORT: (f"{_plural(len(analysis.report.findings), 'finding')} written "
                       f"({analysis.report.metadata.llm_findings} by AI)" if analysis.report
                       else "Report not available; coverage results kept"),
    }

    finished = analysis.created_at
    started = finished - timedelta(milliseconds=sum(analysis.stage_ms.values()))
    cursor = started
    stages = _queued_stages()
    for entry, stage in zip(stages, ANALYSIS_STAGES):
        ms = analysis.stage_ms.get(stage.value)
        if ms is None:  # Agents 2 and 3 are skipped when no risks were found
            entry.state = StageState.SKIPPED
            entry.received = "No risks to check"
            continue
        entry.state = StageState.FAILED if stage is Stage.REPORT and analysis.report is None else StageState.DONE
        entry.sent = sent[stage]
        entry.received = received[stage]
        entry.started_at = cursor
        cursor = cursor + timedelta(milliseconds=ms)
        entry.finished_at = cursor
        entry.duration_ms = ms

    state = RunState.COMPLETE if analysis.status is AnalysisStatus.COMPLETE else RunState.PARTIAL
    return AnalysisProgress(request_id=analysis.request_id, state=state, created_at=started,
                            updated_at=finished, stages=stages)
