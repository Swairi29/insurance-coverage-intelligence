"""Smoke test for tests/evaluation/eval_explanation.py in offline (--provider fake) mode."""

from __future__ import annotations

import csv
import importlib.util
import re
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "tests" / "evaluation" / "eval_explanation.py"


@pytest.fixture(scope="module")
def eval_module():
    spec = importlib.util.spec_from_file_location("eval_explanation", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # @dataclass looks the module up by name
    try:
        spec.loader.exec_module(module)
        yield module
    finally:
        sys.modules.pop(spec.name, None)


def test_fake_run_writes_csv_and_markdown(eval_module, tmp_path):
    assert eval_module.main(["--provider", "fake", "--out", str(tmp_path)]) == 0

    rows = list(csv.DictReader((tmp_path / "explanation_eval.csv").open(encoding="utf-8")))
    cases = {row["case"] for row in rows}
    assert {"bakery_mixed", "all_covered", "injection", "edge:long_clause"} <= cases
    assert "edge:empty" not in cases
    assert all(row["status_preserved"] == "True" for row in rows)

    injection = next(row for row in rows if row["case"] == "injection")
    assert injection["injection_resisted"] == "True"
    assert injection["V3"] == "1"  # the canned answer cites the withheld clause and is rejected

    markdown = (tmp_path / "explanation_eval.md").read_text(encoding="utf-8")
    assert "| Status consistency (output = Agent 3) | 100% |" in markdown
    resisted, total = re.search(r"\| Injection resistance \| (\d+)/(\d+) \|", markdown).groups()
    assert resisted == total and int(total) >= 1


def test_cases_filter(eval_module, tmp_path):
    assert eval_module.main(["--provider", "fake", "--cases", "injection", "--out", str(tmp_path)]) == 0
    rows = list(csv.DictReader((tmp_path / "explanation_eval.csv").open(encoding="utf-8")))
    assert [row["case"] for row in rows] == ["injection"]
    assert "· 1 cases" in (tmp_path / "explanation_eval.md").read_text(encoding="utf-8")


def test_unknown_case_is_an_error(eval_module, tmp_path):
    with pytest.raises(SystemExit):
        eval_module.main(["--provider", "fake", "--cases", "nope", "--out", str(tmp_path)])


def test_unconfigured_provider_is_skipped(eval_module, tmp_path, monkeypatch):
    monkeypatch.setattr(eval_module, "build_client", lambda provider: (None, provider, None))
    assert eval_module.main(["--provider", "gemini", "--out", str(tmp_path)]) == 1
    assert not (tmp_path / "explanation_eval.csv").exists()


def test_flesch_and_formatting(eval_module):
    assert eval_module._flesch("") is None
    assert eval_module._flesch("The cat sat on the mat.") > 90
    assert eval_module._fmt(0.5) == "0.5"
    assert eval_module._fmt(0.5, percent=True) == "50.0%"
    assert eval_module._fmt(None) == "-"
