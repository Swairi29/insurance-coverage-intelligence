"""Build synthetic policy PDFs for the demo businesses in data/sample_policies/synthetic/.

    python scripts/make_sample_policies.py

The insurer, policyholders and wording are all made up. Each policy covers some of the business's
risks, attaches conditions to others and excludes a few, so an analysis shows evidence and gaps.

Agent 2 treats a line of up to 100 characters that starts with "Section", "Clause" or "Part"
(or a short all-caps line) as a heading. So each heading below is on its own line, and the body
text avoids those three words, in case a wrapped line starts with one and swallows the paragraph.
Needs PyMuPDF.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf

OUT = Path(__file__).resolve().parent.parent / "data" / "sample_policies" / "synthetic"

POLICIES = {
    "lagoon-kitchen-policy.pdf": {
        "title": "Coastal Mutual - Restaurant Commercial Package Policy",
        "details": [
            "Policyholder: Lagoon Kitchen, Negombo, Sri Lanka",
            "Policy number: CM-RST-2026-0418",
            "Policy period: 1 January 2026 to 31 December 2026",
        ],
        "sections": [
            ("Section 1 - Fire and Explosion",
             "We will pay for loss or damage to the buildings, kitchen equipment, furniture and food "
             "stock at the premises caused by fire, lightning or explosion. This includes fires that "
             "start in cooking equipment such as deep fryers, grills and gas stoves. Cover for fires "
             "that start in deep fryers applies only if an automatic fire suppression system is fitted "
             "above the fryers and serviced at least every six months. Damage caused by gradual "
             "overheating of electrical wiring is not covered."),
            ("Section 2 - Equipment Breakdown and Refrigeration",
             "We will pay for the repair or replacement of kitchen machinery, including the walk-in "
             "freezer, refrigerators, ice machines and dishwashers, after a sudden and accidental "
             "breakdown. Food stock that spoils because a freezer or refrigerator breaks down is "
             "covered up to LKR 500,000 for each event. Breakdown caused by wear and tear, rust or a "
             "lack of regular maintenance is excluded. The POS system, tablets and other computer "
             "equipment are not covered by this cover."),
            ("Section 3 - Theft and Burglary",
             "Theft of stock, equipment and cash is covered only after forcible and violent entry "
             "into the premises. Cash is covered up to LKR 100,000 when it is kept in a locked safe "
             "outside opening hours. Theft by employees, and theft without forced entry, are not "
             "covered."),
            ("Section 4 - Public and Products Liability",
             "We will cover your legal liability for accidental bodily injury to customers and "
             "members of the public at the premises, for example slips and falls in the dining area. "
             "This cover also includes claims for food poisoning and allergic reactions caused by "
             "food or drink you served, up to LKR 10,000,000 in any one year. Claims arising from "
             "deliveries made by third-party delivery companies are excluded."),
            ("Section 5 - Business Interruption",
             "If the premises cannot be used because of damage covered under the fire or equipment "
             "breakdown cover above, we will pay the loss of gross profit for up to 90 days. Loss of "
             "income caused by a failure of the public power, gas or water supply that is not due to "
             "damage at the premises is excluded."),
            ("Section 6 - General Exclusions",
             "This policy does not cover loss or damage caused by flood, storm surge, rising sea water "
             "or the overflow of the lagoon. It does not cover losses from cyber attacks, hacking, "
             "ransomware, data breaches or the theft of customer data from the online ordering "
             "system. Card payment fraud and chargebacks are not covered. Injury to employees must be "
             "insured under a separate workmen's compensation policy and is not covered here."),
        ],
    },
    "hilltop-hardware-policy.pdf": {
        "title": "Highland General - Retail Shop Insurance Policy",
        "details": [
            "Policyholder: Hilltop Hardware, Kandy, Sri Lanka",
            "Policy number: HG-RTL-2026-1172",
            "Policy period: 1 March 2026 to 28 February 2027",
        ],
        "sections": [
            ("Section 1 - Fire and Allied Perils",
             "We will pay for loss or damage to the shop building, shelving, fixtures and stock caused "
             "by fire, lightning, explosion or accidental smoke damage. Paint, thinners, gas cylinders "
             "and other flammable stock are covered only if they are stored in a separate fire-rated "
             "store room, away from the sales floor. Damage from fires caused by illegal electrical "
             "connections is not covered."),
            ("Section 2 - Theft, Burglary and Shoplifting",
             "Theft of stock and fixtures is covered after forcible and violent entry into the shop "
             "outside opening hours. Shoplifting during opening hours is covered only if the CCTV "
             "system was working and the theft was reported to the police within 24 hours, up to LKR "
             "250,000 in any one year. Cash in the till is covered up to LKR 50,000. Stock found "
             "missing at a stock count with no sign of theft is excluded."),
            ("Section 3 - Public Liability",
             "We will cover your legal liability for accidental bodily injury to customers and "
             "visitors in the shop, for example injury from falling stock, heavy goods or a wet floor. "
             "The limit is LKR 5,000,000 for any one event. Injury caused by products you sold after "
             "they have left the shop, and advice given about how to use tools, is excluded."),
            ("Section 4 - Goods in Transit",
             "Goods carried in your own delivery van to customers within the Central Province are "
             "covered against loss or damage from an accident, fire or theft of the van, up to LKR "
             "300,000 for each journey. Goods left in an unattended vehicle overnight are not covered. "
             "Goods sent by courier or post are not covered."),
            ("Section 5 - Business Interruption",
             "If the shop has to close because of damage covered by the fire cover above, we will pay "
             "the loss of gross profit for up to 60 days. Closure caused by a landslide, road closure "
             "or a government order is excluded."),
            ("Section 6 - General Exclusions",
             "This policy does not cover loss or damage caused by flood, landslide or earth movement. "
             "It does not cover losses from cyber attacks, hacking, data breaches, or the theft of "
             "customer details from the online store. Card payment fraud, chargebacks and online "
             "payment scams are not covered. Breakdown of the POS system, CCTV or other electronic "
             "equipment is not covered. Injury to employees must be insured under a separate "
             "workmen's compensation policy."),
        ],
    },
}

# Built-in Helvetica: it never uses ligatures. A shaped font turned "fire" into "ﬁre" (one
# ligature character), which Agent 2's keyword search would not match.
FONT, FONT_BOLD = "helv", "hebo"
PAGE = pymupdf.paper_rect("a4")
MARGIN = 56  # 2 cm
WIDTH = PAGE.width - 2 * MARGIN


def _wrap(text: str, font: str, size: float) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if pymupdf.get_text_length(candidate, fontname=font, fontsize=size) <= WIDTH:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def build(policy: dict) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=PAGE.width, height=PAGE.height)
    y = MARGIN

    def write(text: str, font: str, size: float, space_before: float = 0, color=(0, 0, 0)) -> None:
        nonlocal page, y
        y += space_before
        for line in _wrap(text, font, size):
            if y + size * 1.4 > PAGE.height - MARGIN:
                page = doc.new_page(width=PAGE.width, height=PAGE.height)
                y = MARGIN
            y += size * 1.4
            page.insert_text((MARGIN, y), line, fontname=font, fontsize=size, color=color)

    write(policy["title"], FONT_BOLD, 15)
    for line in policy["details"]:
        write(line, FONT, 9.5, color=(0.27, 0.27, 0.27))
    for heading, text in policy["sections"]:
        write(heading, FONT_BOLD, 12, space_before=12)
        write(text, FONT, 10.5, space_before=2)
    write("Synthetic sample document for testing InsureIntel. Not a real insurance policy.",
          FONT, 8.5, space_before=18, color=(0.4, 0.4, 0.4))

    doc.set_metadata({"title": policy["title"], "author": "InsureIntel sample data"})
    return doc.tobytes()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, policy in POLICIES.items():
        (OUT / filename).write_bytes(build(policy))
        print(f"Wrote {OUT.relative_to(OUT.parent.parent.parent) / filename}")


if __name__ == "__main__":
    main()
