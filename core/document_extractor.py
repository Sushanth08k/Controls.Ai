"""
Production Document Ingestion & Text Extractor.
Extracts clean, structured text from PDF, DOCX, Markdown, and Plaintext files
for compliance policy interpretation and rule extraction.
"""

import io
import logging
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

logger = logging.getLogger(__name__)


def extract_text_from_pdf(content_bytes: bytes) -> tuple[str, int]:
    """Extract clean text from PDF using PyMuPDF (fitz) with fallback to pypdf."""
    pages_text: list[str] = []
    page_count = 0

    # 1. Try PyMuPDF / fitz
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=content_bytes, filetype="pdf")
        page_count = len(doc)
        for page in doc:
            txt = page.get_text("text")
            if txt and txt.strip():
                pages_text.append(txt.strip())
        if pages_text:
            return "\n\n".join(pages_text), page_count
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed or not available, falling back to pypdf: {e}")

    # 2. Fallback to pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content_bytes))
        page_count = len(reader.pages)
        for page in reader.pages:
            txt = page.extract_text() or ""
            if txt.strip():
                pages_text.append(txt.strip())
        if pages_text:
            return "\n\n".join(pages_text), page_count
    except Exception as e:
        logger.error(f"pypdf extraction failed: {e}")

    return "\n\n".join(pages_text), page_count


def extract_text_from_docx(content_bytes: bytes) -> str:
    """Extract text and tables from Word DOCX archive using standard library zipfile & XML."""
    try:
        with zipfile.ZipFile(io.BytesIO(content_bytes)) as z:
            # WordprocessingML XML namespace
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text_blocks: list[str] = []

            # 1. Main Document
            if "word/document.xml" in z.namelist():
                xml_data = z.read("word/document.xml")
                root = ET.fromstring(xml_data)

                # Process all body elements: paragraphs and tables in order
                for elem in root.iter():
                    if elem.tag.endswith("}p"):
                        # Paragraph text
                        t_parts = [t.text for t in elem.findall(".//w:t", ns) if t.text]
                        if t_parts:
                            line = "".join(t_parts).strip()
                            if line:
                                text_blocks.append(line)
                    elif elem.tag.endswith("}tbl"):
                        # Table rows
                        for row in elem.findall(".//w:tr", ns):
                            row_cells = []
                            for cell in row.findall(".//w:tc", ns):
                                cell_texts = [t.text for t in cell.findall(".//w:t", ns) if t.text]
                                if cell_texts:
                                    row_cells.append("".join(cell_texts).strip())
                            if row_cells:
                                text_blocks.append(" | ".join(row_cells))

            if text_blocks:
                return "\n\n".join(text_blocks)
    except Exception as e:
        logger.error(f"DOCX extraction failed: {e}")

    return ""


def clean_extracted_text(text: str) -> str:
    """Clean common PDF/DOCX artifacts, ligatures, and broken line-wraps."""
    if not text:
        return ""

    # Replace ligatures
    text = (
        text.replace("\ufb01", "fi")
        .replace("\ufb02", "fl")
        .replace("\ufb00", "ff")
        .replace("\ufb03", "ffi")
        .replace("\ufb04", "ffl")
        .replace("\xad", "")  # soft hyphen
    )

    # Normalize carriage returns
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove excessive blank lines (> 2)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def extract_document_content(filename: str, content_bytes: bytes) -> dict[str, Any]:
    """
    Ingest arbitrary document upload (PDF, DOCX, TXT, MD) and return
    clean plain text for policy rule extraction.
    """
    ext = filename.lower().split(".")[-1] if "." in filename else "txt"
    extracted_text = ""
    pages = 1

    if ext == "pdf":
        raw_text, pages = extract_text_from_pdf(content_bytes)
        extracted_text = clean_extracted_text(raw_text)
        format_name = "PDF"

    elif ext in ("docx", "doc"):
        raw_text = extract_text_from_docx(content_bytes)
        if not raw_text and ext == "doc":
            # If older binary .doc, try plain text decode of strings
            raw_text = re.sub(r"[^\x20-\x7E\n\t]", " ", content_bytes.decode("latin-1", errors="ignore"))
            raw_text = re.sub(r"\s{3,}", "\n\n", raw_text)
        extracted_text = clean_extracted_text(raw_text)
        format_name = "DOCX"

    else:
        # Plain text, markdown, csv, json
        format_name = ext.upper()
        for encoding in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                extracted_text = content_bytes.decode(encoding)
                break
            except Exception:
                continue
        extracted_text = clean_extracted_text(extracted_text)

    if not extracted_text:
        extracted_text = f"Document: {filename}\n[Notice: No text content could be extracted from this document.]"

    return {
        "filename": filename,
        "format": format_name,
        "text": extracted_text,
        "pages": pages,
        "size_bytes": len(content_bytes),
    }
