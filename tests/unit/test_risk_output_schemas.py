"""Unit tests for the Risk Profiling output schemas and the safe error response."""

import json

import pytest
from pydantic import ValidationError

from shared.models.business import BusinessType
from shared.models.risk import Evidence, IdentifiedRisk, RiskCategory, RiskSource
from shared.schemas.requests import RiskProfileRequest
from shared.schemas.responses import (
    SCHEMA_VERSION,
    ErrorResponse,
    ProfileMetadata,
    ProfileStatus,
    ProfileWarning,
    RiskProfileResponse,
    WarningCode,
)

pytestmark = pytest.mark.unit


def risk(**overrides):
    data = {
        "risk_id": "FIRE_COOKING",
        "name": "Fire from cooking and baking equipment",
        "category": "fire",
        "reason": "The business uses ovens, which create sustained high heat.",
        "source": "rule",
        "confidence": 0.9,
        "evidence": [{"field": "equipment", "value": "oven"}],
    }
    data.update(overrides)
    return IdentifiedRisk(**data)


def response(**overrides):
    data = {
        "request_id": "req-1",
        "status": "complete",
        "business_name": "Sunrise Bakery",
        "business_type": "bakery",
        "risks": [risk()],
        "metadata": {"taxonomy_version": "1.0", "llm_used": False},
    }
    data.update(overrides)
    return RiskProfileResponse(**data)


# --- IdentifiedRisk ------------------------------------------------------------------

def test_valid_risk_has_the_required_fields():
    r = risk()
    assert r.name and r.reason
    assert r.category is RiskCategory.FIRE
    assert r.source is RiskSource.RULE


@pytest.mark.parametrize("source", ["rule", "llm", "rule+llm"])
def test_all_sources_are_accepted(source):
    assert risk(source=source).source.value == source


def test_evidence_is_optional():
    r = IdentifiedRisk(
        risk_id="PROP_THEFT", name="Theft", category="property",
        reason="Assumed from the business type.", source="rule", confidence=0.3,
    )
    assert r.evidence == []


@pytest.mark.parametrize(
    "field, value",
    [
        ("category", "weather"),          # not in the taxonomy
        ("source", "guess"),
        ("reason", ""),
        ("reason", "   "),
        ("name", ""),
        ("confidence", -0.1),
        ("confidence", 1.1),
        ("risk_id", "fire_cooking"),      # must be capitals
        ("risk_id", "FIRE"),              # needs a prefix and a name
        ("risk_id", "FIRE-COOKING"),
        ("risk_id", "X" * 50),
    ],
)
def test_invalid_risk_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        risk(**{field: value})


def test_missing_required_risk_fields_are_rejected():
    with pytest.raises(ValidationError) as excinfo:
        IdentifiedRisk(risk_id="FIRE_COOKING")
    missing = {e["loc"][0] for e in excinfo.value.errors()}
    assert {"name", "category", "reason", "source", "confidence"} <= missing


def test_evidence_needs_field_and_value():
    with pytest.raises(ValidationError):
        Evidence(field="equipment", value="")


# --- RiskProfileResponse ---------------------------------------------------------------

@pytest.mark.contract
def test_response_json_shape_is_stable():
    data = json.loads(response().model_dump_json())
    assert data["schema_version"] == SCHEMA_VERSION == "1.0"
    assert set(data) == {
        "schema_version", "request_id", "status", "business_name",
        "business_type", "risks", "warnings", "metadata",
    }
    assert set(data["risks"][0]) == {
        "risk_id", "name", "category", "reason", "source", "confidence", "evidence",
    }
    assert data["status"] == "complete"
    assert data["business_type"] == "bakery"
    assert data["risks"][0]["category"] == "fire"


@pytest.mark.contract
def test_response_survives_a_json_round_trip():
    original = response(
        status="partial",
        warnings=[{"code": "missing_field", "field": "employee_count",
                   "message": "Employee count not provided."}],
    )
    assert RiskProfileResponse.model_validate_json(original.model_dump_json()) == original


def test_response_defaults_to_no_risks_and_no_warnings():
    r = response(risks=[])
    assert r.risks == [] and r.warnings == []


def test_duplicate_risk_ids_are_rejected():
    with pytest.raises(ValidationError):
        response(risks=[risk(), risk(name="Same ID again")])


def test_response_rejects_unknown_status_and_business_type():
    with pytest.raises(ValidationError):
        response(status="done")
    with pytest.raises(ValidationError):
        response(business_type="pharmacy")


def test_metadata_and_warning_validation():
    assert ProfileMetadata(taxonomy_version="1.0", llm_used=True, llm_model="m", processing_ms=5)
    with pytest.raises(ValidationError):
        ProfileMetadata(taxonomy_version="1.0", llm_used=True, processing_ms=-1)
    with pytest.raises(ValidationError):
        ProfileWarning(code="something_else", message="x")
    warning = ProfileWarning(code=WarningCode.LLM_UNAVAILABLE, message="Rule-based result only.")
    assert warning.field is None
    assert ProfileStatus("partial") is ProfileStatus.PARTIAL
    assert BusinessType("bakery") is BusinessType.BAKERY


# --- safe validation error messages -------------------------------------------------------

def validation_errors(payload):
    with pytest.raises(ValidationError) as excinfo:
        RiskProfileRequest.model_validate(payload)
    return excinfo.value.errors()


@pytest.mark.security
def test_error_response_lists_field_paths_and_messages():
    errors = validation_errors({
        "business": {"business_name": "Sunrise Bakery", "business_type": "pharmacy",
                     "employee_count": -3},
    })
    body = ErrorResponse.from_validation_errors(errors)
    assert body.error == "validation_error"
    by_field = {d.field: d.message for d in body.details}
    assert set(by_field) == {"business.business_type", "business.employee_count"}
    assert "bakery" in by_field["business.business_type"]  # tells the caller what is supported
    assert all(d.message for d in body.details)


@pytest.mark.security
def test_error_response_never_echoes_input_values():
    secret = "SECRET-TOKEN-abc123"
    errors = validation_errors({
        "request_id": f"bad id {secret}",
        "business": {
            "business_name": "x" * 500 + secret,
            "business_type": f"{secret}-shop",
            "employee_count": f"{secret}",
            "equipment": [secret * 20],
            "description": secret * 500,
            "operations": {"sales_channels": [secret]},
            "location": {"city": secret * 50},
        },
    })
    assert len(errors) >= 6  # several things are wrong at once
    text = ErrorResponse.from_validation_errors(errors).model_dump_json()
    assert secret not in text


@pytest.mark.security
def test_unsafe_field_names_from_the_caller_are_masked():
    errors = validation_errors({
        "business": {"business_name": "A", "business_type": "bakery",
                     "<script>alert(1)</script>": 1},
    })
    body = ErrorResponse.from_validation_errors(errors)
    assert [d.field for d in body.details] == ["business.?"]


@pytest.mark.security
def test_own_validator_messages_are_shown_without_pydantic_prefix():
    errors = validation_errors({"request_id": "has space", "business": {
        "business_name": "A", "business_type": "bakery"}})
    body = ErrorResponse.from_validation_errors(errors)
    assert body.details[0].message.startswith("request_id may only contain")


def test_fastapi_style_locations_drop_the_body_prefix():
    body = ErrorResponse.from_validation_errors([
        {"loc": ("body", "business", "equipment", 0), "msg": "String too long", "type": "x"},
        {"loc": ("body",), "msg": "Field required", "type": "missing"},
        {"loc": (), "msg": "Bad", "type": "x"},
    ])
    assert [d.field for d in body.details] == ["business.equipment.0", "request", "request"]


def test_error_details_are_capped():
    many = [{"loc": ("body", f"f{i}"), "msg": "bad", "type": "x"} for i in range(100)]
    assert len(ErrorResponse.from_validation_errors(many).details) == 20


def test_long_messages_are_truncated_and_missing_messages_get_a_default():
    body = ErrorResponse.from_validation_errors([
        {"loc": ("a",), "msg": "m" * 1000, "type": "x"},
        {"loc": ("b",), "type": "x"},
    ])
    assert len(body.details[0].message) == 200
    assert body.details[1].message == "Invalid value."


def test_empty_error_list_still_gives_a_valid_response():
    body = ErrorResponse.from_validation_errors([])
    assert body.details == [] and body.error == "validation_error"
