import hashlib
from pathlib import Path
from typing import Any
from tools.connectors.base import BaseConnector, ConnectorDescription, OperationDescriptor


class FilesConnector(BaseConnector):
    """Files connector for reading policy and configuration documents with cryptographic digests."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or Path(__file__).resolve().parent.parent.parent

    def describe(self) -> ConnectorDescription:
        return ConnectorDescription(
            name="files",
            version="1.0.0",
            operations=[
                OperationDescriptor(
                    name="list",
                    side_effect="read",
                    role_template="file_reader",
                    description="List documents matching path glob within scope",
                ),
                OperationDescriptor(
                    name="read_document",
                    side_effect="read",
                    role_template="file_reader",
                    description="Read document text with character offsets and SHA-256 digest",
                ),
            ],
        )

    def health(self) -> bool:
        return True

    def execute(self, operation: str, args: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        if operation == "list":
            glob_pattern = args.get("path_glob", "*")
            matched = [str(p.relative_to(self.base_dir)) for p in self.base_dir.glob(glob_pattern)]
            return {"files": matched, "count": len(matched)}

        elif operation == "read_document":
            rel_path = args.get("file_path", "")
            target_file = self.base_dir / rel_path
            if not target_file.exists():
                raise FileNotFoundError(f"File '{rel_path}' not found at {target_file}")

            content = target_file.read_text(encoding="utf-8", errors="replace")
            doc_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()

            # Split by pages/paragraphs to create indexed spans
            spans = []
            paragraphs = content.split("\n\n")
            curr_pos = 0
            for i, p in enumerate(paragraphs):
                p_len = len(p)
                spans.append({
                    "page": 1,
                    "char_start": curr_pos,
                    "char_end": curr_pos + p_len,
                    "text": p,
                })
                curr_pos += p_len + 2

            return {
                "file_path": rel_path,
                "doc_sha256": doc_sha256,
                "content": content,
                "spans": spans,
                "char_length": len(content),
            }

        else:
            raise NotImplementedError(f"Operation '{operation}' not supported by files connector")
