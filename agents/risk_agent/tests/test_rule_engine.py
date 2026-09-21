"""Unit tests for the rule-based risk identification (rule_engine.py).

Covers bakery, restaurant and retail scenarios, incomplete input, unknown
business types, duplicates, reasons and compatibility with the output schema.
No LLM, network or API key is involved.
"""

import pytest

from agents.risk_agent.rule_engine import BASELINE_CONFIDENCE, identify_risks
from agents.risk_agent.taxonomy import RISK_TAXONOMY, RiskDefinition
from shared.models.business import BusinessProfile, BusinessType
from shared.models.risk import RiskCategory, RiskSource
from shared.schemas.requests import RiskProfileRequest
from shared.schemas.responses import RiskProfileResponse, WarningCode

pytestmark = pytest.mark.unit

ALL_IDS = {r.risk_id for r in RISK_TAXONOMY}


def ids(result):
    return {r.risk_id for r in result.risks}


def by_id(result):
    return {r.risk_id: r for r in result.risks}


def evidence_values(risk):
    return [e.value for e in risk.evidence]


# --- scenarios ------------------------------------------------------------------------

@pytest.fixture
def bakery():
    return BusinessProfile(
        business_name="Sunrise Bakery",
        business_type="bakery",
        description="Family bakery baking bread and cakes with wheat flour, butter and eggs. "
        "Customers can also order through our website.",
        employee_count=6,
        equipment=["Deck oven", "Refrigerator", "Dough mixer"],
        operations={
            "sales_channels": ["in_store", "online", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
        },
    )


@pytest.fixture
def restaurant():
    return BusinessProfile(
        business_name="Spice Garden",
        business_type="Restaurant",
        description="Dine-in restaurant serving meals, with home delivery.",
        employee_count=12,
        equipment=["Gas stove", "Deep fryer", "Chest freezer"],
        operations={
            "sales_channels": ["in_store", "delivery"],
            "handles_cash": True,
            "accepts_card_payments": True,
        },
    )


@pytest.fixture
def clothing_shop():
    return BusinessProfile(
        business_name="Threads",
        business_type="retail shop",
        description="Small clothing and accessories shop. Stock is imported from overseas "
        "suppliers and kept in a stockroom.",
        employee_count=2,
        equipment=["POS terminal"],
        operations={
            "sales_channels": ["in_store", "online"],
            "accepts_card_payments": True,
            "stores_customer_data": True,
        },
    )


def test_bakery_scenario(bakery):
    result = identify_risks(bakery)
    risks = by_id(result)

    # Everything in the taxonomy applies to this bakery except two risks.
    assert ids(result) == ALL_IDS - {"LIA_PRODUCT", "BI_SUPPLIER"}
    assert result.warnings == []

    assert "deck oven" in evidence_values(risks["FIRE_COOKING"])
    assert "refrigerator" in evidence_values(risks["EQP_REFRIGERATION"])
    assert {"delivery", "online orders"} <= set(evidence_values(risks["PROP_TRANSIT"]))
    assert "flour" in evidence_values(risks["FIRE_COMBUSTIBLES"])
    assert "6 employees" in evidence_values(risks["EMP_INJURY"])
    assert "cash handling" in evidence_values(risks["EMP_DISHONESTY"])
    assert "card payments" in evidence_values(risks["CYB_PAYMENT_FRAUD"])
    assert risks["FIRE_COOKING"].category is RiskCategory.FIRE
    assert risks["CYB_DATA_BREACH"].category is RiskCategory.CYBER


def test_restaurant_scenario(restaurant):
    result = identify_risks(restaurant)
    risks = by_id(result)

    expected_present = {
        "FIRE_COOKING", "FIRE_COMBUSTIBLES", "FIRE_ELECTRICAL", "EQP_BREAKDOWN",
        "EQP_REFRIGERATION", "EMP_INJURY", "EMP_DISHONESTY", "PROP_THEFT", "PROP_WEATHER",
        "PROP_TRANSIT", "BI_PREMISES_CLOSURE", "BI_UTILITY_OUTAGE", "LIA_PUBLIC",
        "LIA_FOOD_SAFETY", "CYB_PAYMENT_FRAUD",
    }
    assert ids(result) == expected_present

    # A gas stove is both cooking equipment and a gas supply, so it triggers both fire risks.
    assert "gas stove" in evidence_values(risks["FIRE_COMBUSTIBLES"])
    assert {"gas stove", "deep fryer"} <= set(evidence_values(risks["FIRE_COOKING"]))
    # Nothing in the input points to these, and they are not assumed for restaurants.
    assert not ids(result) & {"LIA_PRODUCT", "CYB_DATA_BREACH", "CYB_SYSTEM_OUTAGE", "BI_SUPPLIER"}


def test_retail_clothing_shop_scenario(clothing_shop):
    result = identify_risks(clothing_shop)
    risks = by_id(result)

    assert "FIRE_COOKING" not in risks  # cooking fire does not apply to retail
    assert "EQP_REFRIGERATION" not in risks and "LIA_FOOD_SAFETY" not in risks
    assert {"LIA_PRODUCT", "PROP_THEFT", "BI_SUPPLIER", "CYB_DATA_BREACH",
            "CYB_PAYMENT_FRAUD", "CYB_SYSTEM_OUTAGE", "PROP_TRANSIT"} <= set(risks)

    assert {"clothing", "accessories"} <= set(evidence_values(risks["LIA_PRODUCT"]))
    assert "stockroom" in evidence_values(risks["PROP_THEFT"])
    assert {"imported", "overseas suppliers"} <= set(evidence_values(risks["BI_SUPPLIER"]))
    assert "pos terminal" in evidence_values(risks["CYB_SYSTEM_OUTAGE"])


def test_retail_shop_selling_food_gets_food_risks():
    shop = BusinessProfile(
        business_name="Corner Mart", business_type="retail_shop",
        description="Convenience store selling snacks and drinks.",
        equipment=["Display chiller"],
    )
    risks = by_id(identify_risks(shop))
    assert {"snacks", "drinks"} <= set(evidence_values(risks["LIA_FOOD_SAFETY"]))
    assert evidence_values(risks["EQP_REFRIGERATION"]) == ["display chiller"]


# --- incomplete input -------------------------------------------------------------------

@pytest.mark.parametrize(
    "business_type, expected_count",
    [("bakery", 9), ("restaurant", 9), ("retail_shop", 6)],
)
def test_minimal_profile_only_gets_baseline_risks(business_type, expected_count):
    result = identify_risks(BusinessProfile(business_name="X", business_type=business_type))
    assert len(result.risks) == expected_count
    for risk in result.risks:
        assert risk.confidence == BASELINE_CONFIDENCE
        assert risk.evidence == []
        assert "assumed for a" in risk.reason
        assert risk.source is RiskSource.RULE


def test_baseline_reason_names_the_business_type():
    result = identify_risks(BusinessProfile(business_name="X", business_type="retail_shop"))
    assert all("assumed for a retail shop" in r.reason for r in result.risks)


def test_details_replace_the_assumption():
    minimal = by_id(identify_risks(BusinessProfile(business_name="X", business_type="bakery")))
    detailed = by_id(identify_risks(
        BusinessProfile(business_name="X", business_type="bakery", equipment=["oven"])
    ))
    assert minimal["FIRE_COOKING"].confidence == BASELINE_CONFIDENCE
    assert detailed["FIRE_COOKING"].confidence > BASELINE_CONFIDENCE
    assert "assumed" not in detailed["FIRE_COOKING"].reason


def test_explicit_no_answers_prevent_risks():
    bakery = BusinessProfile(
        business_name="Solo Bakes", business_type="bakery", employee_count=0,
        description="Owner-run bakery. Our staff love it. We accept credit cards.",
        operations={"accepts_card_payments": False, "handles_cash": False,
                    "sales_channels": ["in_store"]},
    )
    result = ids(identify_risks(bakery))
    assert "EMP_INJURY" not in result and "EMP_DISHONESTY" not in result
    assert "CYB_PAYMENT_FRAUD" not in result


# --- unknown business types ------------------------------------------------------------------

@pytest.mark.parametrize("bad_type", ["pharmacy", "", None, 42, ["bakery"], "Bakery!"])
def test_unknown_business_type_is_handled_safely(bad_type):
    profile = BusinessProfile.model_construct(
        business_name="Mystery", business_type=bad_type, equipment=["Freezer", "oven"],
    )
    result = identify_risks(profile)  # must not raise

    assert [w.code for w in result.warnings] == [WarningCode.UNSUPPORTED_BUSINESS_TYPE]
    assert result.warnings[0].field == "business_type"
    # No assumptions: only general risks that have evidence behind them.
    assert "FIRE_COOKING" not in ids(result) and "LIA_PRODUCT" not in ids(result)
    assert {"EQP_REFRIGERATION", "EQP_BREAKDOWN"} <= ids(result)
    for risk in result.risks:
        assert risk.evidence and risk.confidence > BASELINE_CONFIDENCE


def test_unknown_business_type_without_details_gives_no_risks_but_a_warning():
    profile = BusinessProfile.model_construct(business_name="Mystery", business_type="pharmacy")
    result = identify_risks(profile)
    assert result.risks == []
    assert result.warnings


def test_supported_type_has_no_warnings(bakery):
    assert identify_risks(bakery).warnings == []


# --- no duplicates ------------------------------------------------------------------------------

def test_each_risk_appears_once(bakery, restaurant, clothing_shop):
    for profile in (bakery, restaurant, clothing_shop):
        listed = [r.risk_id for r in identify_risks(profile).risks]
        assert len(listed) == len(set(listed))


def test_repeated_input_gives_one_risk_and_no_repeated_evidence():
    profile = BusinessProfile.model_construct(
        business_name="Dup", business_type=BusinessType.BAKERY,
        equipment=["oven", "oven", "Oven"], description="oven oven ovens",
    )
    result = by_id(identify_risks(profile))
    risk = result["FIRE_COOKING"]
    pairs = [(e.field, e.value) for e in risk.evidence]
    assert pairs == [("equipment", "oven")]  # equipment beats description; repeats collapse
    assert risk.reason.endswith("(based on: oven)")


def test_duplicate_ids_in_a_custom_taxonomy_are_reported_once():
    one = _definition("TEST_ONE", indicators=("cooking_equipment",))
    result = identify_risks(_bakery_with(equipment=["oven"]), taxonomy=(one, one))
    assert [r.risk_id for r in result.risks] == ["TEST_ONE"]


# --- reasons -------------------------------------------------------------------------------------

def test_every_risk_has_a_clear_reason_built_from_the_taxonomy(bakery, restaurant, clothing_shop):
    definitions = {d.risk_id: d for d in RISK_TAXONOMY}
    for profile in (bakery, restaurant, clothing_shop):
        for risk in identify_risks(profile).risks:
            assert risk.reason.startswith(definitions[risk.risk_id].reason)
            assert risk.name == definitions[risk.risk_id].name
            assert len(risk.reason) <= 600
            if risk.evidence:
                assert "(based on:" in risk.reason
                assert risk.evidence[0].value.lower() in risk.reason.lower()
            else:
                assert "(assumed for a" in risk.reason


def test_long_evidence_lists_are_shortened_in_the_reason():
    profile = _bakery_with(equipment=["oven", "stove", "fryer", "grill", "griddle", "wok"])
    risk = by_id(identify_risks(profile))["FIRE_COOKING"]
    assert len(risk.evidence) == 6  # nothing is lost from the evidence list...
    assert risk.reason.endswith("(based on: oven, stove, fryer, grill and 2 more)")


# --- confidence and ordering ------------------------------------------------------------------------

def test_confidence_grows_with_matching_indicators_up_to_a_cap():
    four = _definition(
        "TEST_FOUR", indicators=("cooking_equipment", "refrigeration", "pos_system", "cash_handling")
    )
    cases = [
        (["oven"], 0.7),
        (["oven", "fridge"], 0.8),
        (["oven", "fridge", "POS"], 0.9),
        (["oven", "fridge", "POS", "cash register"], 0.9),  # cap
    ]
    for equipment, expected in cases:
        result = identify_risks(_bakery_with(equipment=equipment), taxonomy=(four,))
        assert result.risks[0].confidence == expected, equipment


def test_results_are_sorted_by_confidence_then_taxonomy_order(bakery):
    risks = identify_risks(bakery).risks
    confidences = [r.confidence for r in risks]
    assert confidences == sorted(confidences, reverse=True)

    order = {d.risk_id: i for i, d in enumerate(RISK_TAXONOMY)}
    for first, second in zip(risks, risks[1:]):
        if first.confidence == second.confidence:
            assert order[first.risk_id] < order[second.risk_id]


def test_results_are_deterministic(bakery):
    assert identify_risks(bakery) == identify_risks(bakery)


# --- maintainability ------------------------------------------------------------------------------------

def test_adding_a_risk_to_the_taxonomy_needs_no_code_change():
    new_risk = _definition(
        "TEST_NEW", indicators=("cooking_equipment",), applies_to=frozenset({BusinessType.BAKERY})
    )
    assert ids(identify_risks(_bakery_with(equipment=["oven"]), taxonomy=(new_risk,))) == {"TEST_NEW"}
    # Not applicable to other business types, even with matching equipment.
    restaurant = BusinessProfile(business_name="R", business_type="restaurant", equipment=["oven"])
    assert identify_risks(restaurant, taxonomy=(new_risk,)).risks == []


# --- compatibility with the schemas -------------------------------------------------------------------------

@pytest.mark.contract
def test_results_fit_the_response_schema(bakery, restaurant, clothing_shop):
    for profile in (bakery, restaurant, clothing_shop):
        result = identify_risks(profile)
        response = RiskProfileResponse(
            request_id="req-1", status="complete", business_name=profile.business_name,
            business_type=profile.business_type, risks=result.risks, warnings=result.warnings,
            metadata={"taxonomy_version": "1.0", "llm_used": False},
        )
        assert RiskProfileResponse.model_validate_json(response.model_dump_json()) == response


def test_works_with_a_request_built_from_json():
    request = RiskProfileRequest.model_validate_json(
        '{"business": {"business_name": "Cafe Lanka", "business_type": "Restaurant",'
        ' "equipment": ["gas stove"], "employee_count": 3}}'
    )
    result = identify_risks(request.business)
    assert {"FIRE_COOKING", "FIRE_COMBUSTIBLES", "EMP_INJURY"} <= ids(result)


# --- helpers --------------------------------------------------------------------------------------------------

def _definition(risk_id, indicators, applies_to=None):
    applies_to = applies_to or frozenset(BusinessType)
    return RiskDefinition(
        risk_id=risk_id, name="Test risk", category=RiskCategory.FIRE, description="Test.",
        applies_to=applies_to, baseline_for=frozenset(), indicators=indicators,
        reason="Test reason.",
    )


def _bakery_with(**overrides):
    return BusinessProfile(business_name="B", business_type="bakery", **overrides)
