# Agent 2 policy document parsing and chunking (Member 2)
"""Turn an uploaded policy PDF into searchable, evidence-grounded chunks.

Pipeline, in plain steps:
1. `extract_pages`: read the PDF with PyMuPDF, one page of raw text at a time.
2. `clean_text`: strip control characters and tidy whitespace, keeping line breaks.
3. `detect_section` walks each page's lines to find heading-like lines (best
   effort - insurance policies are not consistently formatted), so the text
   between two headings can be tagged with the section it belongs to.
4. `chunk_page_text` splits each section's text into overlapping windows sized
   from the shared settings, preferring paragraph breaks over mid-sentence cuts.
5. `build_chunks` ties it together into `PolicyChunk` objects, and scans every
   chunk for instruction-like phrasing (`scan_for_prompt_injection`) without
   ever blocking ingestion - a policy PDF is always data, never an instruction.

If a page has little or no extractable text - a sign it may be a scanned
image rather than a real text layer - `extract_pages` renders that page to an
image (using PyMuPDF itself) and runs OCR on it via `pytesseract`. OCR needs
the separate Tesseract program installed on the machine; if it is missing or
fails, that page is logged and left as-is rather than failing the upload.

Chunks never cross a page boundary, so `PolicyChunk.page` always stays accurate.
"""

import logging
import re
from typing import List, Optional, Tuple

import fitz
import pytesseract
from PIL import Image

from shared.config.settings import get_settings
from shared.models.policy import PolicyChunk
from shared.utils.security import scan_for_prompt_injection

logger = logging.getLogger(__name__)

# Control characters except tab (\x09), newline (\x0a) and carriage return (\x0d).
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Below this many non-whitespace characters, a page is treated as possibly
# scanned (no real text layer) and OCR is attempted as a fallback.
MIN_TEXT_LENGTH_BEFORE_OCR = 20

_MAX_HEADING_LENGTH = 100

_SECTION_PATTERNS: Tuple[re.Pattern, ...] = (
    # "Section 4", "Clause 12(a)", "Part B" ...
    re.compile(r"^(section|clause|part)\s+[a-z0-9]+\b.*$", re.IGNORECASE),
    # "4.2 Exclusions", "12 Definitions"
    re.compile(r"^\d{1,2}(\.\d{1,2}){0,2}\s+[A-Z][A-Za-z0-9 ,&/'\-]{2,80}$"),
    # "EXCLUSIONS", "GENERAL CONDITIONS" - a short, all-caps line
    re.compile(r"^[A-Z][A-Z0-9 ,&/'\-]{3,60}$"),
)


def extract_pages(
    pdf_bytes: bytes, *, ocr_enabled: Optional[bool] = None
) -> List[Tuple[int, str]]:
    """Return `(page_number, raw_text)` for every page, page numbers starting at 1.

    A page with little or no extractable text falls back to OCR when
    `ocr_enabled` (or `settings.ocr_enabled` if not given) is true.
    """
    if ocr_enabled is None:
        ocr_enabled = get_settings().ocr_enabled

    pages: List[Tuple[int, str]] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        for index, page in enumerate(document, start=1):
            text = page.get_text()
            if ocr_enabled and len(text.strip()) < MIN_TEXT_LENGTH_BEFORE_OCR:
                text = _text_with_ocr_fallback(page, text)
            pages.append((index, text))
    return pages


def _text_with_ocr_fallback(page: "fitz.Page", fallback_text: str) -> str:
    """Try OCR on a page that looks like it has no real text layer.

    Returns the OCR result if it produced something usable, otherwise the
    original (likely empty) text. Never raises - a missing or failing
    Tesseract installation is logged and treated the same as "no text found".
    """
    try:
        pixmap = page.get_pixmap(dpi=200)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        ocr_text = pytesseract.image_to_string(image)
    except Exception:
        logger.warning(
            "OCR could not be run on a page with little extractable text "
            "(Tesseract may not be installed); leaving it as-is."
        )
        return fallback_text
    return ocr_text if ocr_text.strip() else fallback_text


def clean_text(text: str) -> str:
    """Remove control characters and collapse horizontal whitespace, keeping line breaks."""
    if not text:
        return ""
    text = _CONTROL_CHARS.sub("", text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(lines)


def detect_section(line: str) -> Optional[str]:
    """Return the line itself if it looks like a section/clause heading, else `None`."""
    stripped = line.strip()
    if not stripped or len(stripped) > _MAX_HEADING_LENGTH:
        return None
    for pattern in _SECTION_PATTERNS:
        if pattern.match(stripped):
            return stripped
    return None


def _segment_by_section(cleaned_page_text: str) -> List[Tuple[Optional[str], str]]:
    """Split one page's cleaned text into `(section_or_None, body_text)` pieces.

    A new segment starts every time a heading-like line is found. Blank lines
    inside a segment are kept (as paragraph separators for `chunk_page_text`),
    but a segment with no non-blank content is dropped.
    """
    segments: List[Tuple[Optional[str], List[str]]] = []
    current_section: Optional[str] = None
    current_lines: List[str] = []

    for line in cleaned_page_text.splitlines():
        heading = detect_section(line)
        if heading is not None:
            if any(l.strip() for l in current_lines):
                segments.append((current_section, current_lines))
            current_section = heading
            current_lines = []
            continue
        current_lines.append(line)

    if any(l.strip() for l in current_lines):
        segments.append((current_section, current_lines))

    return [(section, "\n".join(lines)) for section, lines in segments]


def chunk_page_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Split `text` into overlapping windows of at most `chunk_size` characters.

    Paragraphs (separated by a blank line) are packed together while they fit;
    a paragraph longer than `chunk_size` on its own is hard-split at a word
    boundary. `overlap` characters from the end of one chunk are carried into
    the start of the next, so a clause split across chunks still has context.
    """
    # Overlap must stay well below chunk_size, or a hard split can make no forward
    # progress (the "next" window would start at or before where this one started).
    overlap = max(0, min(overlap, chunk_size // 2))
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return []

    chunks: List[str] = []
    current = ""

    def _hard_split(piece: str) -> None:
        nonlocal current
        current = piece
        while len(current) > chunk_size:
            cut = current.rfind(" ", 0, chunk_size)
            if cut <= 0:
                cut = chunk_size
            chunks.append(current[:cut].strip())
            current = current[max(cut - overlap, 0):].strip()

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            chunks.append(current)
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}\n\n{paragraph}".strip() if tail else paragraph
        else:
            current = paragraph

        if len(current) > chunk_size:
            _hard_split(current)

    if current.strip():
        chunks.append(current.strip())

    return chunks


def build_chunks(
    pdf_bytes: bytes,
    policy_id: str,
    business_id: str,
    *,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> Tuple[List[PolicyChunk], int]:
    """Extract, clean, section-tag and chunk a policy PDF.

    Returns `(chunks, page_count)`. Every chunk is scanned for instruction-like
    phrasing; a match sets `flagged`/`flag_reason` but never removes the chunk.
    """
    settings = get_settings()
    size = chunk_size if chunk_size is not None else settings.chunk_size
    overlap = chunk_overlap if chunk_overlap is not None else settings.chunk_overlap

    pages = extract_pages(pdf_bytes)
    chunks: List[PolicyChunk] = []
    counter = 0

    for page_number, raw_text in pages:
        for section, body in _segment_by_section(clean_text(raw_text)):
            for piece in chunk_page_text(body, size, overlap):
                counter += 1
                flag_reason = scan_for_prompt_injection(piece)
                chunks.append(
                    PolicyChunk(
                        chunk_id=f"{policy_id}-p{page_number}-{counter}",
                        policy_id=policy_id,
                        business_id=business_id,
                        section=section,
                        page=page_number,
                        text=piece,
                        flagged=flag_reason is not None,
                        flag_reason=flag_reason,
                    )
                )

    return chunks, len(pages)
