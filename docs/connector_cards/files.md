# Connector Card: Files & Document Connector (`files`)

---

## 1. Overview
The `files` connector handles the secure ingestion, structural parsing, and canonical hashing of unstructured regulatory and policy documents (PDF, DOCX, TXT). It serves Archetype E (`doc_review_wf`) and policy-driven workflows in Archetype D.

---

## 2. Capabilities & Operations

| Operation | Side Effect | Role Template | Description |
|---|---|---|---|
| `read_file` | `read` | `doc_reader` | Reads raw document bytes and calculates SHA-256 content hash. |
| `parse_document` | `read` | `doc_reader` | Structurally parses documents into tokens, paragraphs, and sections with character offset spans. |
| `list_directory` | `read` | `doc_reader` | Enumerates files in an approved policy repository directory. |

---

## 3. Security & Operational Invariants

1. **Path Traversal Protection:** Path parameters are strictly validated against allowlisted policy storage roots. Path traversal attempts (`..`, symlink escapes) fail immediately.
2. **Grounding & Citation Bounds:** Parsed outputs maintain exact start/end character offsets for every token/sentence. Any downstream extraction by an LLM must match these exact byte offsets.
3. **No Code Execution:** Documents are parsed strictly via pure data parsers (e.g. Docling/pypdf); no macros, scripts, or embedded active content are ever executed.
