# document_extractor.py
"""Unified document text extraction for PDF, DOCX, and TXT formats."""

import re
from pathlib import Path

import fitz  # PyMuPDF


def clean_extracted_text(text: str) -> str:
    """
    Clean extracted text:
    1. Normalize line endings
    2. Remove extra spaces and blank lines
    3. Strip control characters
    """
    if not text:
        return ""

    text = text.replace("\r\n", "\n")
    text = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\xff]", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)

    return text.strip()


def _extract_pdf(file_path: str) -> tuple[str, str]:
    """Extract full text + first-2-page header from PDF."""
    full_text_list = []
    header_text_list = []

    with fitz.open(file_path) as doc:
        for idx, page in enumerate(doc):
            page_text = page.get_text()
            full_text_list.append(page_text)
            if idx < 2:
                header_text_list.append(page_text)

    return (
        clean_extracted_text("\n".join(full_text_list)),
        clean_extracted_text("\n".join(header_text_list)),
    )


def _extract_docx(file_path: str) -> tuple[str, str]:
    """Extract text from DOCX file. Header = first 2000 chars."""
    from docx import Document

    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n\n".join(paragraphs)
    cleaned = clean_extracted_text(full_text)

    # Use first ~2000 chars as header for metadata extraction
    header = cleaned[:2000]
    return cleaned, header


def _extract_txt(file_path: str) -> tuple[str, str]:
    """Extract text from plain TXT file (UTF-8)."""
    with open(file_path, "r", encoding="utf-8") as f:
        full_text = f.read()
    cleaned = clean_extracted_text(full_text)
    header = cleaned[:2000]
    return cleaned, header


def extract_document_to_text(file_path: str) -> tuple[str, str]:
    """
    Unified entry point: detect file format and extract text.

    Supports: .pdf, .docx, .txt

    Returns:
        (full_text, header_text) tuple
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _extract_pdf(file_path)
    elif suffix == ".docx":
        return _extract_docx(file_path)
    elif suffix in (".txt", ".text", ".md"):
        return _extract_txt(file_path)
    else:
        raise ValueError(
            f"Unsupported file format: {suffix}. "
            f"Supported formats: .pdf, .docx, .txt"
        )
