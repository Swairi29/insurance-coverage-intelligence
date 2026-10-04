"""The main small-business types and "other" (with the owner's own description)."""

import pytest

from agents.explanation_agent.templates import business_label
from agents.risk_agent.rule_engine import identify_risks
from agents.risk_agent.taxonomy import FOOD_TYPES, RETAIL_TYPES
from shared.models.business import BusinessProfile, BusinessType


def _ids(profile: BusinessProfile) -> set:
    return {risk.risk_id for risk in identify_risks(profile).risks}


def test_every_type_except_other_has_a_report_label():
    for business_type in BusinessType:
        label = business_label(business_type)
        if business_type is BusinessType.OTHER:
            assert label == "a business like yours"
        else:
            assert label.startswith("a ") and business_type.value.split("_")[0] in label.replace(" ", "_")


@pytest.mark.parametrize("raw, expected", [
    ("Coffee shop", BusinessType.CAFE),
    ("supermarket", BusinessType.GROCERY_STORE),
    ("Hair salon", BusinessType.SALON),
    ("garage", BusinessType.REPAIR_WORKSHOP),
    ("Other", BusinessType.OTHER),
])
def test_friendly_spellings(raw, expected):
    assert BusinessProfile(business_name="X", business_type=raw).business_type is expected


def test_cafe_is_a_food_business():
    assert BusinessType.CAFE in FOOD_TYPES
    assert {"FIRE_COOKING", "LIA_FOOD_SAFETY"} <= _ids(BusinessProfile(business_name="X", business_type="cafe"))


def test_pharmacy_is_a_shop():
    assert BusinessType.PHARMACY in RETAIL_TYPES
    assert "LIA_PRODUCT" in _ids(BusinessProfile(business_name="X", business_type="pharmacy"))


def test_salon_gets_general_risks_but_nothing_food_or_retail_specific():
    risks = _ids(BusinessProfile(business_name="X", business_type="salon"))
    assert {"PROP_THEFT", "LIA_PUBLIC"} <= risks
    assert not {"FIRE_COOKING", "LIA_FOOD_SAFETY", "LIA_PRODUCT"} & risks


def test_other_uses_the_owners_description_of_the_business():
    profile = BusinessProfile(business_name="X", business_type="other",
                              business_type_detail="  Bakery\nsupplies   wholesaler ")
    assert profile.business_type_detail == "Bakery supplies wholesaler"
    result = identify_risks(profile)
    assert result.warnings == []  # "other" is a supported choice, not an error
    # Baseline wording names a "business", never "a other".
    assert all("a other" not in risk.reason for risk in result.risks)


def test_other_detail_can_point_to_risks():
    plain = _ids(BusinessProfile(business_name="X", business_type="other"))
    detailed = _ids(BusinessProfile(business_name="X", business_type="other",
                                    business_type_detail="catering kitchen with gas ovens"))
    # Food-only risks such as FIRE_COOKING stay out (taxonomy), but the gas supply and
    # equipment named in the description add general risks.
    assert detailed > plain
    assert "FIRE_COOKING" not in detailed


def test_type_detail_length_is_limited():
    with pytest.raises(ValueError):
        BusinessProfile(business_name="X", business_type="other", business_type_detail="x" * 61)
