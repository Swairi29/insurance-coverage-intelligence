"""Turn a business profile into indicator tags, each with the evidence behind it.

Three sources are used, in this order of priority:
1. structured fields (employee count, sales channels, yes/no answers, location);
2. the equipment list;
3. keywords found in the free-text description.

If a tag is already backed by a higher-priority source, lower-priority matches for
the same tag are skipped, so the evidence stays short and non-repetitive.

An explicit "no" wins over keywords: `handles_cash=False` (or `employee_count=0`)
removes that tag even if the description mentions cash or staff.

Keyword matching is deliberately simple (whole words, plurals allowed, no grammar
understanding). The words themselves live in `rules/feature_lexicon.json`, so they
can be extended without touching this code.
"""

import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Pattern, Set

from agents.risk_agent.taxonomy import FEATURE_TAGS
from shared.models.business import BusinessProfile, Location, Operations
from shared.models.risk import Evidence

LEXICON_PATH = Path(__file__).parent / "rules" / "feature_lexicon.json"
MAX_DESCRIPTION_MATCHES_PER_TAG = 3

# tag -> the evidence that supports it
FeatureMap = Dict[str, List[Evidence]]


def _normalize_text(text: str) -> str:
    """Lowercase and treat hyphens, underscores and slashes as spaces ("walk-in" == "walk in")."""
    return re.sub(r"[-_/]+", " ", text.lower())


def _compile_keywords(keywords: Iterable[str]) -> Pattern:
    """One regex per tag: whole words or phrases, with an optional plural ending."""
    parts = []
    for keyword in sorted(set(keywords), key=len, reverse=True):  # longest phrase first
        words = _normalize_text(keyword).split()
        parts.append(r"\s+".join(re.escape(word) for word in words))
    return re.compile(r"\b(?:" + "|".join(parts) + r")(?:s|es)?\b")


def load_lexicon(path: Path = LEXICON_PATH) -> Dict[str, Pattern]:
    """Read the keyword file and compile it. Fails early on a typo in a tag name."""
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    unknown = sorted(set(raw) - set(FEATURE_TAGS))
    if unknown:
        raise ValueError(f"feature_lexicon.json uses unknown tags: {', '.join(unknown)}")
    return {tag: _compile_keywords(words) for tag, words in raw.items() if words}


_PATTERNS = load_lexicon()


def match_keywords(text: str) -> Dict[str, List[str]]:
    """Return {tag: [matched phrases]} for the keywords found in `text`."""
    normalized = _normalize_text(text)
    hits: Dict[str, List[str]] = {}
    for tag, pattern in _PATTERNS.items():
        phrases: List[str] = []
        for match in pattern.finditer(normalized):
            if match.group(0) not in phrases:
                phrases.append(match.group(0))
        if phrases:
            hits[tag] = phrases
    return hits


def _add(stage: FeatureMap, tag: str, field: str, value: str) -> None:
    evidence = Evidence(field=field, value=value)
    items = stage.setdefault(tag, [])
    if evidence not in items:
        items.append(evidence)


def extract_features(profile: BusinessProfile) -> FeatureMap:
    """Find every indicator tag supported by the profile, with evidence."""
    operations = getattr(profile, "operations", None) or Operations()
    location = getattr(profile, "location", None) or Location()
    employee_count = getattr(profile, "employee_count", None)

    structured: FeatureMap = {}
    denied: Set[str] = set()

    # 1. Structured fields --------------------------------------------------
    if employee_count is not None:
        if employee_count > 0:
            noun = "employee" if employee_count == 1 else "employees"
            _add(structured, "has_employees", "employee_count", f"{employee_count} {noun}")
        else:
            denied.add("has_employees")

    channels = {getattr(c, "value", c) for c in operations.sales_channels}
    channel_tags = {
        "online": ["online_orders"],
        "delivery": ["delivery_channel"],
        "in_store": ["customer_footfall", "physical_premises"],
    }
    for channel, tags in channel_tags.items():
        if channel in channels:
            for tag in tags:
                _add(structured, tag, "operations.sales_channels", FEATURE_TAGS[tag])

    yes_no_fields = [
        (operations.accepts_card_payments, "card_payments", "operations.accepts_card_payments"),
        (operations.handles_cash, "cash_handling", "operations.handles_cash"),
        (operations.stores_customer_data, "stores_customer_data", "operations.stores_customer_data"),
        (operations.operates_single_location, "single_location", "operations.operates_single_location"),
        (location.flood_prone_area, "flood_prone_area", "location.flood_prone_area"),
    ]
    for answer, tag, field in yes_no_fields:
        if answer is True:
            _add(structured, tag, field, FEATURE_TAGS[tag])
        elif answer is False:
            denied.add(tag)

    # 2. Equipment list -----------------------------------------------------
    from_equipment: FeatureMap = {}
    for item in getattr(profile, "equipment", None) or []:
        text = str(item).strip()
        if not text:
            continue
        for tag in match_keywords(text):
            _add(from_equipment, tag, "equipment", text.lower())

    # 3. Free-text description ----------------------------------------------
    from_description: FeatureMap = {}
    description = getattr(profile, "description", None) or ""
    for tag, phrases in match_keywords(description).items():
        for phrase in phrases[:MAX_DESCRIPTION_MATCHES_PER_TAG]:
            _add(from_description, tag, "description", phrase)

    # Merge by priority, then apply explicit "no" answers.
    found: FeatureMap = {}
    for stage in (structured, from_equipment, from_description):
        for tag, evidence in stage.items():
            found.setdefault(tag, evidence)
    for tag in denied:
        found.pop(tag, None)
    return found
