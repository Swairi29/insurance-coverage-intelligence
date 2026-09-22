"""Unit tests for indicator extraction (features.py)."""

import json

import pytest

from agents.risk_agent.features import extract_features, load_lexicon, match_keywords
from shared.models.business import BusinessProfile

pytestmark = pytest.mark.unit


def profile(**overrides):
    data = {"business_name": "Test Business", "business_type": "bakery"}
    data.update(overrides)
    return BusinessProfile(**data)


def values(features, tag):
    return [e.value for e in features[tag]]


# --- keyword matching -----------------------------------------------------------------

@pytest.mark.parametrize(
    "text, tag",
    [
        ("We have two ovens", "cooking_equipment"),         # plural
        ("DEEP FRYER", "cooking_equipment"),                # case + two words
        ("deep-fryer", "cooking_equipment"),                # hyphen
        ("walk-in cooler", "refrigeration"),
        ("fridges", "refrigeration"),
        ("home deliveries", "delivery_channel"),            # irregular plural listed in lexicon
        ("customers walk in all day", "customer_footfall"),
        ("e-commerce website", "online_orders"),
    ],
)
def test_keywords_match_words_plurals_and_hyphens(text, tag):
    assert tag in match_keywords(text)


@pytest.mark.parametrize(
    "text, tag",
    [
        ("stovepipe", "cooking_equipment"),   # only whole words count
        ("we open until midnight", "pos_system"),
        ("the ovenbird", "cooking_equipment"),
        ("possible", "pos_system"),
        ("", "cooking_equipment"),
    ],
)
def test_keywords_do_not_match_inside_other_words(text, tag):
    assert tag not in match_keywords(text)


def test_one_phrase_can_indicate_several_tags():
    hits = match_keywords("gas stove")
    assert "cooking_equipment" in hits and "gas_supply" in hits


# --- evidence sources and priority ------------------------------------------------------

def test_equipment_items_give_evidence_with_original_wording():
    features = extract_features(profile(equipment=["Deck Oven", "Chest freezer"]))
    assert features["cooking_equipment"][0].field == "equipment"
    assert values(features, "cooking_equipment") == ["deck oven"]
    assert values(features, "refrigeration") == ["chest freezer"]


def test_description_gives_evidence():
    features = extract_features(profile(description="We bake in three ovens."))
    assert features["cooking_equipment"][0].field == "description"
    assert values(features, "cooking_equipment") == ["ovens"]


def test_equipment_list_wins_over_description_for_the_same_tag():
    features = extract_features(profile(equipment=["oven"], description="We bake in ovens."))
    assert [(e.field, e.value) for e in features["cooking_equipment"]] == [("equipment", "oven")]


def test_structured_answer_wins_over_keywords():
    features = extract_features(
        profile(description="We take card payments.", operations={"accepts_card_payments": True})
    )
    assert [e.field for e in features["card_payments"]] == ["operations.accepts_card_payments"]


def test_description_matches_per_tag_are_limited():
    text = "oven, stove, fryer, grill, griddle, wok, tandoor"
    features = extract_features(profile(description=text))
    assert len(features["cooking_equipment"]) == 3


# --- structured fields -------------------------------------------------------------------

def test_employee_count():
    assert values(extract_features(profile(employee_count=1)), "has_employees") == ["1 employee"]
    assert values(extract_features(profile(employee_count=8)), "has_employees") == ["8 employees"]
    assert "has_employees" not in extract_features(profile(employee_count=None))


def test_sales_channels_map_to_indicators():
    features = extract_features(
        profile(operations={"sales_channels": ["online", "delivery", "in_store", "wholesale"]})
    )
    assert {"online_orders", "delivery_channel", "customer_footfall", "physical_premises"} <= set(features)


@pytest.mark.parametrize(
    "field, tag",
    [
        ("accepts_card_payments", "card_payments"),
        ("handles_cash", "cash_handling"),
        ("stores_customer_data", "stores_customer_data"),
        ("operates_single_location", "single_location"),
    ],
)
def test_yes_answers_create_indicators(field, tag):
    features = extract_features(profile(operations={field: True}))
    assert features[tag][0].field == f"operations.{field}"


def test_flood_prone_location():
    features = extract_features(profile(location={"flood_prone_area": True}))
    assert features["flood_prone_area"][0].field == "location.flood_prone_area"


# --- explicit "no" beats keywords ----------------------------------------------------------

@pytest.mark.parametrize(
    "overrides, tag",
    [
        ({"operations": {"handles_cash": False}, "description": "We use a cash register."}, "cash_handling"),
        ({"operations": {"accepts_card_payments": False}, "description": "We accept credit cards."}, "card_payments"),
        ({"operations": {"stores_customer_data": False}, "description": "We keep a customer list."}, "stores_customer_data"),
        ({"employee_count": 0, "description": "Our staff bake daily."}, "has_employees"),
        ({"location": {"flood_prone_area": False}, "description": "Near the river, floods sometimes."}, "flood_prone_area"),
    ],
)
def test_explicit_no_removes_the_indicator(overrides, tag):
    assert tag not in extract_features(profile(**overrides))


def test_unknown_answer_still_allows_keywords():
    features = extract_features(
        profile(description="We use a cash register.", operations={"handles_cash": None})
    )
    assert "cash_handling" in features and "pos_system" in features


# --- robustness -----------------------------------------------------------------------------

def test_empty_profile_has_no_indicators():
    assert extract_features(profile()) == {}


def test_profile_with_missing_pieces_does_not_crash():
    broken = BusinessProfile.model_construct(
        business_name="X", business_type="bakery", equipment=None, operations=None,
        location=None, description=None, employee_count=None,
    )
    assert extract_features(broken) == {}


def test_lexicon_with_unknown_tag_is_rejected(tmp_path):
    bad = tmp_path / "lexicon.json"
    bad.write_text(json.dumps({"not_a_real_tag": ["x"]}), encoding="utf-8")
    with pytest.raises(ValueError, match="unknown tags"):
        load_lexicon(bad)
