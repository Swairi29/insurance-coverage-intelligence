"""Unit tests for the Risk Profiling input schemas (business profile and request)."""

import pytest
from pydantic import ValidationError

from shared.models.business import (
    MAX_DESCRIPTION_LENGTH,
    MAX_EMPLOYEES,
    MAX_EQUIPMENT_ITEM_LENGTH,
    MAX_EQUIPMENT_ITEMS,
    MAX_NAME_LENGTH,
    BusinessProfile,
    BusinessType,
    Location,
    Operations,
    SalesChannel,
)
from shared.schemas.requests import RiskProfileRequest

pytestmark = pytest.mark.unit


def profile(**overrides):
    """A minimal valid business profile, with optional overrides."""
    data = {"business_name": "Sunrise Bakery", "business_type": "bakery"}
    data.update(overrides)
    return BusinessProfile(**data)


def error_locations(excinfo):
    return {".".join(str(p) for p in err["loc"]) for err in excinfo.value.errors()}


# --- valid input ----------------------------------------------------------------

def test_full_bakery_example_is_accepted():
    p = BusinessProfile(
        business_name="Sunrise Bakery",
        business_type="bakery",
        description="Small family bakery selling bread and cakes, with online orders.",
        employee_count=6,
        equipment=["oven", "refrigerator", "dough mixer"],
        operations={
            "sales_channels": ["in_store", "online", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
            "operates_single_location": True,
        },
        location={"city": "Colombo", "country": "Sri Lanka", "flood_prone_area": False},
    )
    assert p.business_type is BusinessType.BAKERY
    assert p.employee_count == 6
    assert p.operations.sales_channels == [
        SalesChannel.IN_STORE, SalesChannel.ONLINE, SalesChannel.DELIVERY
    ]
    assert p.location.city == "Colombo"


def test_minimal_input_gets_safe_defaults():
    p = profile()
    assert p.description is None
    assert p.employee_count is None
    assert p.equipment == []
    assert p.operations.sales_channels == []
    assert p.operations.accepts_card_payments is None  # None = "not known"
    assert p.location.city is None
    assert p.location.flood_prone_area is None


def test_null_values_for_optional_fields_are_safe():
    p = profile(
        description=None, employee_count=None, equipment=None,
        operations=None, location=None,
    )
    assert p.equipment == []
    assert isinstance(p.operations, Operations)
    assert isinstance(p.location, Location)


def test_zero_employees_is_valid():
    assert profile(employee_count=0).employee_count == 0


def test_json_output_uses_plain_values():
    data = profile(operations={"sales_channels": ["online"]}).model_dump(mode="json")
    assert data["business_type"] == "bakery"
    assert data["operations"]["sales_channels"] == ["online"]


# --- business type ---------------------------------------------------------------

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("bakery", BusinessType.BAKERY),
        ("Bakery", BusinessType.BAKERY),
        ("  RESTAURANT  ", BusinessType.RESTAURANT),
        ("retail_shop", BusinessType.RETAIL_SHOP),
        ("Retail Shop", BusinessType.RETAIL_SHOP),
        ("retail-shop", BusinessType.RETAIL_SHOP),
        ("small retail shop", BusinessType.RETAIL_SHOP),
        ("retail", BusinessType.RETAIL_SHOP),
    ],
)
def test_business_type_is_normalised(raw, expected):
    assert profile(business_type=raw).business_type is expected


@pytest.mark.parametrize("raw", ["pharmacy", "", "   ", "bakery shop!!", 5, None, ["bakery"]])
def test_unsupported_business_type_is_rejected(raw):
    with pytest.raises(ValidationError) as excinfo:
        profile(business_type=raw)
    assert error_locations(excinfo) == {"business_type"}


def test_missing_business_type_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        BusinessProfile(business_name="Sunrise Bakery")
    assert "business_type" in error_locations(excinfo)


# --- business name ---------------------------------------------------------------

def test_name_is_trimmed_and_whitespace_collapsed():
    assert profile(business_name="  Sunrise \t  Bakery\n").business_name == "Sunrise Bakery"


def test_control_characters_are_removed_from_name():
    assert profile(business_name="Sun\x00rise\x07 Bakery").business_name == "Sunrise Bakery"


@pytest.mark.parametrize("raw", ["", "   ", "\x00\x01", None, 123])
def test_missing_or_blank_name_is_rejected(raw):
    with pytest.raises(ValidationError) as excinfo:
        profile(business_name=raw)
    assert error_locations(excinfo) == {"business_name"}


def test_name_length_limit():
    assert profile(business_name="A" * MAX_NAME_LENGTH)
    with pytest.raises(ValidationError):
        profile(business_name="A" * (MAX_NAME_LENGTH + 1))


def test_name_is_required():
    with pytest.raises(ValidationError) as excinfo:
        BusinessProfile(business_type="bakery")
    assert "business_name" in error_locations(excinfo)


# --- description -----------------------------------------------------------------

def test_blank_description_becomes_none():
    assert profile(description="   \n ").description is None


def test_description_keeps_line_breaks_but_drops_control_characters():
    p = profile(description="Sells bread.\nOnline orders.\x00\x1b")
    assert p.description == "Sells bread.\nOnline orders."


def test_description_length_limit():
    assert profile(description="a" * MAX_DESCRIPTION_LENGTH)
    with pytest.raises(ValidationError) as excinfo:
        profile(description="a" * (MAX_DESCRIPTION_LENGTH + 1))
    assert error_locations(excinfo) == {"description"}


# --- employees -------------------------------------------------------------------

@pytest.mark.parametrize("raw", [-1, MAX_EMPLOYEES + 1, 2.5, "many", [], {}])
def test_invalid_employee_count_is_rejected(raw):
    with pytest.raises(ValidationError) as excinfo:
        profile(employee_count=raw)
    assert error_locations(excinfo) == {"employee_count"}


def test_employee_count_upper_bound_is_valid():
    assert profile(employee_count=MAX_EMPLOYEES).employee_count == MAX_EMPLOYEES


# --- equipment -------------------------------------------------------------------

def test_equipment_is_cleaned_and_deduplicated():
    p = profile(equipment=["Oven", " oven ", "", "   ", "Refrigerator", "OVEN"])
    assert p.equipment == ["Oven", "Refrigerator"]


def test_equipment_item_too_long_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        profile(equipment=["x" * (MAX_EQUIPMENT_ITEM_LENGTH + 1)])
    assert error_locations(excinfo) == {"equipment.0"}


def test_too_many_equipment_items_is_rejected():
    items = [f"item {i}" for i in range(MAX_EQUIPMENT_ITEMS + 1)]
    with pytest.raises(ValidationError) as excinfo:
        profile(equipment=items)
    assert error_locations(excinfo) == {"equipment"}


@pytest.mark.parametrize("raw", ["oven", 5, {"oven": 1}, [1, 2]])
def test_equipment_must_be_a_list_of_text(raw):
    with pytest.raises(ValidationError):
        profile(equipment=raw)


# --- operations ------------------------------------------------------------------

def test_sales_channels_are_normalised_and_deduplicated():
    p = profile(operations={"sales_channels": ["Online", "IN-STORE", "in store", "online"]})
    assert p.operations.sales_channels == [SalesChannel.ONLINE, SalesChannel.IN_STORE]


def test_null_sales_channels_become_empty_list():
    assert profile(operations={"sales_channels": None}).operations.sales_channels == []


@pytest.mark.parametrize("raw", [["telepathy"], "online", [5], [""]])
def test_invalid_sales_channels_are_rejected(raw):
    with pytest.raises(ValidationError) as excinfo:
        profile(operations={"sales_channels": raw})
    assert "operations.sales_channels" in ".".join(error_locations(excinfo))


def test_unknown_operations_field_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        profile(operations={"has_drone": True})
    assert error_locations(excinfo) == {"operations.has_drone"}


def test_yes_no_fields_keep_none_distinct_from_false():
    ops = profile(operations={"handles_cash": False}).operations
    assert ops.handles_cash is False
    assert ops.accepts_card_payments is None


# --- location --------------------------------------------------------------------

def test_blank_place_names_become_none():
    loc = profile(location={"city": "  ", "district": "", "country": None}).location
    assert (loc.city, loc.district, loc.country) == (None, None, None)


def test_place_name_is_cleaned():
    assert profile(location={"city": "  Colombo\x00  "}).location.city == "Colombo"


def test_place_name_too_long_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        profile(location={"city": "c" * 200})
    assert error_locations(excinfo) == {"location.city"}


# --- unknown fields --------------------------------------------------------------

def test_unknown_business_field_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        profile(employe_count=5)  # typo of employee_count
    assert error_locations(excinfo) == {"employe_count"}


# --- request wrapper ---------------------------------------------------------------

def test_request_id_is_generated_when_missing():
    a = RiskProfileRequest(business=profile())
    b = RiskProfileRequest(business=profile())
    assert a.request_id and b.request_id and a.request_id != b.request_id


def test_null_request_id_is_generated():
    assert RiskProfileRequest(request_id=None, business=profile()).request_id


def test_given_request_id_is_kept():
    assert RiskProfileRequest(request_id="req-123_A", business=profile()).request_id == "req-123_A"


@pytest.mark.parametrize("raw", ["", "has space", "semi;colon", "new\nline", "x" * 65, 42])
def test_invalid_request_id_is_rejected(raw):
    with pytest.raises(ValidationError) as excinfo:
        RiskProfileRequest(request_id=raw, business=profile())
    assert error_locations(excinfo) == {"request_id"}


def test_business_is_required_in_request():
    with pytest.raises(ValidationError) as excinfo:
        RiskProfileRequest()
    assert error_locations(excinfo) == {"business"}


def test_business_must_be_an_object():
    with pytest.raises(ValidationError):
        RiskProfileRequest(business="Sunrise Bakery")


def test_unknown_request_field_is_rejected():
    with pytest.raises(ValidationError) as excinfo:
        RiskProfileRequest(business=profile(), debug=True)
    assert error_locations(excinfo) == {"debug"}


def test_request_can_be_built_from_plain_json():
    req = RiskProfileRequest.model_validate_json(
        '{"business": {"business_name": "Cafe Lanka", "business_type": "Restaurant",'
        ' "equipment": ["gas stove", "deep fryer"]}}'
    )
    assert req.business.business_type is BusinessType.RESTAURANT
    assert req.business.equipment == ["gas stove", "deep fryer"]
