"""The Risk Profiling Agent's risk taxonomy.

The taxonomy is a fixed list of *business risks* (not insurance products). Each
entry says which businesses it applies to, which "indicators" point to it, and
why it matters. The rule engine reads this list; it contains no logic itself.

To add a risk: add one `RiskDefinition` to `RISK_TAXONOMY`. To add a new indicator
tag: add it to `FEATURE_TAGS` and give it keywords in `rules/feature_lexicon.json`.
The tests check that the two stay consistent.
"""

from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Tuple

from shared.models.business import BusinessType
from shared.models.risk import RiskCategory

TAXONOMY_VERSION = "1.0"

ALL_TYPES: FrozenSet[BusinessType] = frozenset(BusinessType)
FOOD_TYPES: FrozenSet[BusinessType] = frozenset({BusinessType.BAKERY, BusinessType.RESTAURANT})
RETAIL_TYPES: FrozenSet[BusinessType] = frozenset({BusinessType.RETAIL_SHOP})
NO_TYPES: FrozenSet[BusinessType] = frozenset()

# Indicator tags: tag -> plain-English label. The label is used as evidence text
# when a tag comes from a structured field (e.g. "accepts card payments").
FEATURE_TAGS: Dict[str, str] = {
    # premises
    "physical_premises": "physical premises",
    "single_location": "a single location",
    "customer_footfall": "customers visiting the premises",
    "flood_prone_area": "a flood-prone location",
    # stock and suppliers
    "stock_on_premises": "stock kept on site",
    "perishable_stock": "perishable stock",
    "combustible_materials": "combustible materials",
    "uses_common_allergens": "common food allergens",
    "sells_physical_goods": "physical goods for sale",
    "resells_third_party_products": "third-party products",
    "imported_goods": "imported goods",
    "relies_on_few_suppliers": "few suppliers",
    # equipment
    "cooking_equipment": "cooking equipment",
    "gas_supply": "a gas supply",
    "refrigeration": "refrigeration",
    "electrical_equipment": "electrical equipment",
    "production_equipment": "production equipment",
    "pos_system": "a point-of-sale system",
    "valuable_equipment": "valuable equipment",
    # people and tasks
    "has_employees": "employees",
    "hazardous_work_tasks": "hazardous work tasks",
    "cash_handling": "cash handling",
    # food
    "prepares_food": "food preparation",
    "sells_food": "food sales",
    # sales and digital
    "online_orders": "online orders",
    "delivery_channel": "delivery",
    "card_payments": "card payments",
    "stores_customer_data": "stored customer data",
    "loyalty_program": "a loyalty program",
    "cloud_systems": "cloud or online systems",
}


@dataclass(frozen=True)
class RiskDefinition:
    risk_id: str
    name: str
    category: RiskCategory
    description: str  # what the risk is
    applies_to: FrozenSet[BusinessType]  # business types this risk is relevant to
    baseline_for: FrozenSet[BusinessType]  # types where it is assumed even with no details
    indicators: Tuple[str, ...]  # tags from FEATURE_TAGS; any one of them identifies the risk
    reason: str  # why this risk matters (shown to the user)


RISK_TAXONOMY: Tuple[RiskDefinition, ...] = (
    # --- Property ---------------------------------------------------------
    RiskDefinition(
        risk_id="PROP_THEFT",
        name="Theft, burglary and vandalism",
        category=RiskCategory.PROPERTY,
        description="Stock, cash or equipment is stolen or damaged by intruders or vandals.",
        applies_to=ALL_TYPES,
        baseline_for=ALL_TYPES,
        indicators=("stock_on_premises", "cash_handling", "valuable_equipment"),
        reason="Stock, cash and equipment kept on the premises can be stolen or damaged by "
        "intruders or vandals.",
    ),
    RiskDefinition(
        risk_id="PROP_WEATHER",
        name="Flood, storm and water damage",
        category=RiskCategory.PROPERTY,
        description="Premises, stock and equipment are damaged by flooding, storms or burst pipes.",
        applies_to=ALL_TYPES,
        baseline_for=ALL_TYPES,
        indicators=("flood_prone_area", "stock_on_premises"),
        reason="Premises, stock and equipment can be damaged by flooding, storms or burst pipes.",
    ),
    RiskDefinition(
        risk_id="PROP_TRANSIT",
        name="Loss or damage of goods in delivery",
        category=RiskCategory.PROPERTY,
        description="Goods are lost, spoiled or damaged on the way to customers.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("delivery_channel", "online_orders"),
        reason="Goods sent to customers can be lost, spoiled or damaged on the way, outside "
        "the business's control.",
    ),
    # --- Fire -------------------------------------------------------------
    RiskDefinition(
        risk_id="FIRE_COOKING",
        name="Fire from cooking and baking equipment",
        category=RiskCategory.FIRE,
        description="A fire starts at ovens, fryers, grills or gas burners.",
        applies_to=FOOD_TYPES,
        baseline_for=FOOD_TYPES,
        indicators=("cooking_equipment", "gas_supply"),
        reason="Ovens, fryers, grills and gas burners create sustained high heat and open "
        "flame, which are ignition sources.",
    ),
    RiskDefinition(
        risk_id="FIRE_ELECTRICAL",
        name="Electrical fire",
        category=RiskCategory.FIRE,
        description="Faulty wiring or overloaded appliances start a fire.",
        applies_to=ALL_TYPES,
        baseline_for=ALL_TYPES,
        indicators=("electrical_equipment", "refrigeration"),
        reason="Equipment that runs for long hours puts constant load on the electrical "
        "system, and faults can start a fire.",
    ),
    RiskDefinition(
        risk_id="FIRE_COMBUSTIBLES",
        name="Fire or explosion from combustible materials",
        category=RiskCategory.FIRE,
        description="Flour dust, cooking oil, packaging or gas cylinders feed or spread a "
        "fire, or explode.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("combustible_materials", "gas_supply"),
        reason="Flour dust, cooking oil, packaging and gas cylinders can feed or spread a "
        "fire, or explode.",
    ),
    # --- Equipment --------------------------------------------------------
    RiskDefinition(
        risk_id="EQP_BREAKDOWN",
        name="Equipment breakdown",
        category=RiskCategory.EQUIPMENT,
        description="Key machinery or systems stop working.",
        applies_to=ALL_TYPES,
        baseline_for=FOOD_TYPES,
        indicators=("cooking_equipment", "refrigeration", "production_equipment", "pos_system"),
        reason="Daily work depends on key machinery and systems, so a breakdown stops work "
        "and can be costly to repair.",
    ),
    RiskDefinition(
        risk_id="EQP_REFRIGERATION",
        name="Refrigeration failure and stock spoilage",
        category=RiskCategory.EQUIPMENT,
        description="Cold storage fails and perishable stock is lost.",
        applies_to=ALL_TYPES,
        baseline_for=FOOD_TYPES,
        indicators=("refrigeration", "perishable_stock"),
        reason="Perishable stock depends on cold storage, and a failure can spoil it quickly.",
    ),
    # --- Employee ---------------------------------------------------------
    RiskDefinition(
        risk_id="EMP_INJURY",
        name="Employee injury at work",
        category=RiskCategory.EMPLOYEE,
        description="Staff are hurt by burns, cuts, slips or lifting.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("has_employees", "hazardous_work_tasks", "cooking_equipment"),
        reason="Staff working with heat, sharp tools or heavy lifting can be hurt by burns, "
        "cuts, slips or strains.",
    ),
    RiskDefinition(
        risk_id="EMP_DISHONESTY",
        name="Employee theft or fraud",
        category=RiskCategory.EMPLOYEE,
        description="Staff steal cash or stock, or manipulate records.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("has_employees", "cash_handling", "stock_on_premises"),
        reason="Staff with access to cash and stock have the opportunity to steal or "
        "falsify records.",
    ),
    # --- Business interruption -------------------------------------------
    RiskDefinition(
        risk_id="BI_PREMISES_CLOSURE",
        name="Forced closure after premises damage",
        category=RiskCategory.BUSINESS_INTERRUPTION,
        description="The site cannot be used after an incident, so trading stops.",
        applies_to=ALL_TYPES,
        baseline_for=ALL_TYPES,
        indicators=("single_location", "physical_premises"),
        reason="If the premises cannot be used after an incident, trading stops because "
        "there is no alternative site.",
    ),
    RiskDefinition(
        risk_id="BI_UTILITY_OUTAGE",
        name="Power, gas or water outage",
        category=RiskCategory.BUSINESS_INTERRUPTION,
        description="A utility failure halts production or sales.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("refrigeration", "cooking_equipment", "pos_system"),
        reason="Cooking, cold storage and sales systems cannot run without power, gas or "
        "water, so an outage halts work.",
    ),
    RiskDefinition(
        risk_id="BI_SUPPLIER",
        name="Supplier or supply-chain disruption",
        category=RiskCategory.BUSINESS_INTERRUPTION,
        description="Key ingredients or stock cannot be delivered.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("relies_on_few_suppliers", "perishable_stock", "imported_goods"),
        reason="If key suppliers fail to deliver, the business quickly cannot make or sell "
        "its products.",
    ),
    # --- Liability --------------------------------------------------------
    RiskDefinition(
        risk_id="LIA_PUBLIC",
        name="Customer or visitor injury on premises",
        category=RiskCategory.LIABILITY,
        description="A customer is injured by a slip, trip or fall.",
        applies_to=ALL_TYPES,
        baseline_for=ALL_TYPES,
        indicators=("customer_footfall", "physical_premises"),
        reason="Customers and visitors on the premises can be hurt by slips, trips or falls.",
    ),
    RiskDefinition(
        risk_id="LIA_FOOD_SAFETY",
        name="Food-borne illness and allergen incidents",
        category=RiskCategory.LIABILITY,
        description="Contamination or undeclared allergens harm a customer.",
        applies_to=ALL_TYPES,
        baseline_for=FOOD_TYPES,
        indicators=("prepares_food", "sells_food", "uses_common_allergens"),
        reason="Contamination or undeclared allergens in food can make customers ill.",
    ),
    RiskDefinition(
        risk_id="LIA_PRODUCT",
        name="Harm caused by products sold",
        category=RiskCategory.LIABILITY,
        description="A product sold is faulty or unsafe and injures someone.",
        applies_to=RETAIL_TYPES,
        baseline_for=RETAIL_TYPES,
        indicators=("sells_physical_goods", "resells_third_party_products"),
        reason="A faulty or unsafe product that has been sold can injure a customer.",
    ),
    # --- Cyber ------------------------------------------------------------
    RiskDefinition(
        risk_id="CYB_DATA_BREACH",
        name="Customer data breach",
        category=RiskCategory.CYBER,
        description="Customer details are stolen or exposed.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("stores_customer_data", "online_orders", "loyalty_program"),
        reason="Customer details collected and stored by the business can be stolen or "
        "exposed in a breach.",
    ),
    RiskDefinition(
        risk_id="CYB_PAYMENT_FRAUD",
        name="Payment fraud and chargebacks",
        category=RiskCategory.CYBER,
        description="Stolen cards or false disputes cause losses.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("card_payments", "online_orders"),
        reason="Card and online payments are targets for fraud, stolen cards and false disputes.",
    ),
    RiskDefinition(
        risk_id="CYB_SYSTEM_OUTAGE",
        name="Ransomware or system outage",
        category=RiskCategory.CYBER,
        description="Digital systems are locked or offline and sales stop.",
        applies_to=ALL_TYPES,
        baseline_for=NO_TYPES,
        indicators=("pos_system", "online_orders", "cloud_systems"),
        reason="Sales that depend on digital systems stop if those systems are locked by "
        "an attack or go offline.",
    ),
)


def risks_for(business_type: BusinessType) -> List[RiskDefinition]:
    """Risks relevant to one supported business type, in taxonomy order."""
    return [r for r in RISK_TAXONOMY if business_type in r.applies_to]


def universal_risks() -> List[RiskDefinition]:
    """Risks that apply to every supported business type (used for unknown types)."""
    return [r for r in RISK_TAXONOMY if r.applies_to >= ALL_TYPES]
