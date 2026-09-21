"""Consistency checks for the risk taxonomy and the keyword lexicon.

These tests protect maintainability: if someone adds a risk or a keyword and
makes a mistake (typo in a tag, duplicate ID, ...), a test fails immediately.
"""

import json
from collections import Counter

import pytest

from agents.risk_agent.features import LEXICON_PATH
from agents.risk_agent.taxonomy import (
    ALL_TYPES,
    FEATURE_TAGS,
    RISK_TAXONOMY,
    risks_for,
    universal_risks,
)
from shared.models.business import BusinessType
from shared.models.risk import IdentifiedRisk, RiskCategory

pytestmark = pytest.mark.unit

with open(LEXICON_PATH, encoding="utf-8") as _handle:
    LEXICON = json.load(_handle)


def test_risk_ids_are_unique():
    counts = Counter(r.risk_id for r in RISK_TAXONOMY)
    assert [rid for rid, n in counts.items() if n > 1] == []


@pytest.mark.parametrize("risk", RISK_TAXONOMY, ids=lambda r: r.risk_id)
def test_each_risk_is_valid_for_the_output_schema(risk):
    # Builds the output object the rule engine will build; fails on a bad ID, name or category.
    IdentifiedRisk(
        risk_id=risk.risk_id, name=risk.name, category=risk.category,
        reason=risk.reason, source="rule", confidence=0.5,
    )


@pytest.mark.parametrize("risk", RISK_TAXONOMY, ids=lambda r: r.risk_id)
def test_each_risk_is_well_formed(risk):
    assert risk.description.strip()
    assert risk.reason.strip().endswith(".")
    assert len(risk.reason) <= 250  # leaves room for the "(based on: ...)" part (max 600)
    assert risk.indicators, "a risk needs at least one indicator"
    assert set(risk.indicators) <= set(FEATURE_TAGS), "unknown indicator tag"
    assert len(set(risk.indicators)) == len(risk.indicators)
    assert risk.applies_to and risk.applies_to <= ALL_TYPES
    assert risk.baseline_for <= risk.applies_to


def test_taxonomy_describes_risks_only_not_insurance():
    forbidden = ("insur", "coverage", "policy", "premium", "claim")
    for risk in RISK_TAXONOMY:
        text = " ".join([risk.name, risk.description, risk.reason]).lower()
        assert not [w for w in forbidden if w in text], risk.risk_id


def test_every_category_has_at_least_one_risk():
    assert {r.category for r in RISK_TAXONOMY} == set(RiskCategory)


def test_every_indicator_tag_is_used_by_some_risk():
    used = {tag for r in RISK_TAXONOMY for tag in r.indicators}
    assert set(FEATURE_TAGS) - used == set()


def test_every_business_type_has_risks_and_baseline_risks():
    for business_type in BusinessType:
        assert risks_for(business_type)
        assert [r for r in RISK_TAXONOMY if business_type in r.baseline_for]


def test_baseline_risks_per_business_type():
    # Regression guard for the approved design (● in the applicability matrix).
    def baseline(bt):
        return {r.risk_id for r in RISK_TAXONOMY if bt in r.baseline_for}

    common = {"PROP_THEFT", "PROP_WEATHER", "FIRE_ELECTRICAL", "BI_PREMISES_CLOSURE", "LIA_PUBLIC"}
    food = common | {"FIRE_COOKING", "EQP_BREAKDOWN", "EQP_REFRIGERATION", "LIA_FOOD_SAFETY"}
    assert baseline(BusinessType.BAKERY) == food
    assert baseline(BusinessType.RESTAURANT) == food
    assert baseline(BusinessType.RETAIL_SHOP) == common | {"LIA_PRODUCT"}


def test_universal_risks_exclude_type_specific_ones():
    ids = {r.risk_id for r in universal_risks()}
    assert "FIRE_COOKING" not in ids and "LIA_PRODUCT" not in ids
    assert "PROP_THEFT" in ids


# --- lexicon --------------------------------------------------------------------------

def test_lexicon_only_uses_known_tags():
    assert set(LEXICON) - set(FEATURE_TAGS) == set()


def test_every_tag_has_keywords():
    assert {tag for tag in FEATURE_TAGS if not LEXICON.get(tag)} == set()


@pytest.mark.parametrize("tag", sorted(LEXICON))
def test_lexicon_keywords_are_clean(tag):
    keywords = LEXICON[tag]
    assert all(k == k.strip().lower() and k for k in keywords), "keywords must be lowercase, non-empty"
    assert len(set(keywords)) == len(keywords), "duplicate keyword"
