# Business profile data model (shared)
"""Input-side models that describe an SME (small or medium business).

Design rules used here:
- Only `business_name` and `business_type` are required. Everything else is
  optional and has a safe default, so incomplete input never crashes a consumer
  (lists default to empty, nested objects default to "nothing known").
- Text is cleaned (control characters removed, whitespace tidied) and length
  limited, because it may later be sent to an LLM.
- Unknown fields are rejected, so a typo such as `employe_count` is reported
  instead of silently ignored.
"""

import re
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# --- limits (kept in one place so they are easy to change) --------------------
MAX_NAME_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 2000
MAX_PLACE_LENGTH = 80
MAX_EMPLOYEES = 250  # upper bound for an SME
MAX_EQUIPMENT_ITEMS = 50
MAX_EQUIPMENT_ITEM_LENGTH = 60

# Control characters except tab (\x09), newline (\x0a) and carriage return (\x0d).
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_single_line(value: str) -> str:
    """Remove control characters and collapse all whitespace to single spaces."""
    return " ".join(_CONTROL_CHARS.sub("", value).split())


def _clean_multi_line(value: str) -> str:
    """Remove control characters but keep line breaks."""
    return _CONTROL_CHARS.sub("", value).strip()


def _normalize_token(value):
    """'Retail Shop' / 'retail-shop' / ' RETAIL_SHOP ' -> 'retail_shop'. Non-strings pass through."""
    if isinstance(value, str):
        return re.sub(r"[\s\-]+", "_", value.strip().lower())
    return value


class _InputModel(BaseModel):
    """Base class for input models: trim strings and reject unknown fields."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BusinessType(str, Enum):
    """Business types the Risk Profiling Agent currently supports."""

    BAKERY = "bakery"
    RESTAURANT = "restaurant"
    RETAIL_SHOP = "retail_shop"


# Friendly spellings that map onto a supported type (after normalisation).
_BUSINESS_TYPE_ALIASES = {
    "retail": "retail_shop",
    "retail_store": "retail_shop",
    "shop": "retail_shop",
    "small_retail_shop": "retail_shop",
}


class SalesChannel(str, Enum):
    """How the business sells to customers."""

    IN_STORE = "in_store"
    ONLINE = "online"
    DELIVERY = "delivery"
    WHOLESALE = "wholesale"


class Location(_InputModel):
    """Where the business operates. Every field is optional."""

    city: Optional[str] = Field(default=None, max_length=MAX_PLACE_LENGTH)
    district: Optional[str] = Field(default=None, max_length=MAX_PLACE_LENGTH)
    country: Optional[str] = Field(default=None, max_length=MAX_PLACE_LENGTH)
    # True/False if the owner knows; None means "not known".
    flood_prone_area: Optional[bool] = None

    @field_validator("city", "district", "country", mode="before")
    @classmethod
    def _clean_place(cls, value):
        if isinstance(value, str):
            return _clean_single_line(value) or None  # blank -> "not provided"
        return value


class Operations(_InputModel):
    """How the business runs day to day. Every field is optional.

    For the yes/no fields, None means "not known", which is different from False.
    """

    sales_channels: List[SalesChannel] = Field(default_factory=list)
    accepts_card_payments: Optional[bool] = None
    handles_cash: Optional[bool] = None
    stores_customer_data: Optional[bool] = None
    operates_single_location: Optional[bool] = None

    @field_validator("sales_channels", mode="before")
    @classmethod
    def _clean_channels(cls, value):
        if value is None:
            return []
        if not isinstance(value, (list, tuple)):
            return value  # let Pydantic report the type error
        cleaned = []
        for item in (_normalize_token(v) for v in value):
            if item not in cleaned:  # drop duplicates, keep order
                cleaned.append(item)
        return cleaned


class BusinessProfile(_InputModel):
    """Structured information about one SME."""

    business_name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    business_type: BusinessType
    description: Optional[str] = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    employee_count: Optional[int] = Field(default=None, ge=0, le=MAX_EMPLOYEES)
    equipment: List[
        Annotated[str, StringConstraints(max_length=MAX_EQUIPMENT_ITEM_LENGTH)]
    ] = Field(default_factory=list, max_length=MAX_EQUIPMENT_ITEMS)
    operations: Operations = Field(default_factory=Operations)
    location: Location = Field(default_factory=Location)

    @field_validator("business_name", mode="before")
    @classmethod
    def _clean_name(cls, value):
        return _clean_single_line(value) if isinstance(value, str) else value

    @field_validator("business_type", mode="before")
    @classmethod
    def _normalize_business_type(cls, value):
        token = _normalize_token(value)
        if isinstance(token, str):
            return _BUSINESS_TYPE_ALIASES.get(token, token)
        return token  # not text: let Pydantic report the error

    @field_validator("description", mode="before")
    @classmethod
    def _clean_description(cls, value):
        if isinstance(value, str):
            return _clean_multi_line(value) or None  # blank -> "not provided"
        return value

    @field_validator("equipment", mode="before")
    @classmethod
    def _clean_equipment(cls, value):
        if value is None:
            return []
        if not isinstance(value, (list, tuple)):
            return value  # let Pydantic report the type error (e.g. a plain string)
        seen = set()
        cleaned = []
        for item in value:
            if isinstance(item, str):
                item = _clean_single_line(item)
                if not item:
                    continue  # ignore blank entries
                key = item.lower()
                if key in seen:
                    continue  # ignore "Oven" / "oven" duplicates
                seen.add(key)
            cleaned.append(item)
        return cleaned

    @field_validator("operations", "location", mode="before")
    @classmethod
    def _null_means_empty(cls, value):
        # `"operations": null` behaves the same as leaving it out.
        return {} if value is None else value
