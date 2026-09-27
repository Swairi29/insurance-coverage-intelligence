"""Synthetic demo data shared by scripts/seed_demo.py and scripts/make_frontend_fixtures.py.

Everything here is made up: the business names, the policy wording and the account. No real
policy document or personal data.
"""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Synthetic policy wording, one string per PDF page.
BUSINESS_PACK = [
    "Section 1 - Fire. We will pay for loss or damage to buildings, stock and contents caused by "
    "fire, lightning or explosion at the premises.",
    "Section 2 - Burglary. Theft of stock and cash is covered only following forcible and violent "
    "entry into the premises.",
    "Section 3 - Machinery. Breakdown of ovens, refrigerators and other machinery is excluded.",
    "Section 4 - Public Liability. We will indemnify you against legal liability for accidental "
    "bodily injury to customers or members of the public occurring at the premises.",
]


def flood_extension_pages() -> list[str]:
    """One page with an instruction-like sentence, so Agent 2 flags it (a prompt-injection test)."""
    path = REPO / "data" / "sample_policies" / "adversarial" / "injected_exclusion.txt"
    return [path.read_text(encoding="utf-8")]


BUSINESSES = {
    "bakery": {
        "business_name": "Sunrise Bakery",
        "business_type": "bakery",
        "description": "A bakery producing bread, cakes and pastries, with a small cafe area.",
        "employee_count": 8,
        "equipment": ["Ovens", "Refrigerators", "Mixers"],
        "operations": {
            "sales_channels": ["in_store", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": False,
            "operates_single_location": True,
        },
        "location": {"city": "Colombo", "country": "Sri Lanka", "flood_prone_area": True},
    },
    "restaurant": {
        "business_name": "Lagoon Kitchen",
        "business_type": "restaurant",
        "description": "A seafood restaurant with 40 seats, deep fryers and online orders.",
        "employee_count": 22,
        "equipment": ["Deep fryers", "Gas stoves", "Walk-in freezer", "POS system"],
        "operations": {
            "sales_channels": ["in_store", "online", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
            "operates_single_location": True,
        },
        "location": {"city": "Negombo", "country": "Sri Lanka", "flood_prone_area": None},
    },
    "retail_shop": {
        "business_name": "Hilltop Hardware",
        "business_type": "retail_shop",
        "description": "A hardware and household goods shop with an online store.",
        "employee_count": 5,
        "equipment": ["POS system", "CCTV"],
        "operations": {
            "sales_channels": ["in_store", "online"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
            "operates_single_location": True,
        },
        "location": {"city": "Kandy", "country": "Sri Lanka"},
    },
}


def policy_pdf(pages: list[str]) -> bytes:
    """A text-based PDF with one page per string. Needs PyMuPDF."""
    import pymupdf

    doc = pymupdf.open()
    for text in pages:
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 545, 800), text, fontsize=11)
    return doc.tobytes()


def demo_policy_files() -> list[tuple[str, bytes]]:
    """(filename, PDF bytes) for the two demo policies."""
    return [
        ("sunrise-business-pack.pdf", policy_pdf(BUSINESS_PACK)),
        ("flood-extension.pdf", policy_pdf(flood_extension_pages())),
    ]
