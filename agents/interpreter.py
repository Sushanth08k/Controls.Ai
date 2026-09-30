from typing import Any
from contracts.models import PolicyIR
from core.llm import structured_call


class InterpreterAgent:
    """Generic Document Interpreter implementing dual-extraction with citations."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def extract_with_role(self, role: str, document_content: str, doc_sha256: str) -> PolicyIR:
        inputs = {
            "document_content": document_content,
            "source_doc_sha256": doc_sha256,
        }
        return structured_call(
            role=role,
            template_id="policy_interpretation",
            template_version=self.template_version,
            inputs=inputs,
            output_model=PolicyIR,
            temperature=0.0,
        )

    def dual_extract(self, document_content: str, doc_sha256: str) -> tuple[PolicyIR, PolicyIR]:
        """Perform dual extraction with reasoner and fast models."""
        ir_a = self.extract_with_role("reasoner", document_content, doc_sha256)
        ir_b = self.extract_with_role("fast", document_content, doc_sha256)
        return ir_a, ir_b
