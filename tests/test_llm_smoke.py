import os
from unittest.mock import MagicMock, patch
from pydantic import BaseModel
import pytest

from core.llm import load_template, render_template, structured_call


class EchoOutput(BaseModel):
    message: str
    confidence: float

    @classmethod
    def mock_instance(cls) -> "EchoOutput":
        return cls(message="Mocked response", confidence=0.99)


def test_load_and_render_template() -> None:
    template = load_template("sample_echo", 1)
    assert "{{text}}" in template

    rendered = render_template(template, {"text": "hello world"})
    assert "hello world" in rendered
    assert "{{text}}" not in rendered


def test_structured_call_with_mock() -> None:
    os.environ["LITELLM_MOCK"] = "1"
    res = structured_call(
        role="reasoner",
        template_id="sample_echo",
        template_version=1,
        inputs={"text": "smoke test"},
        output_model=EchoOutput,
    )
    assert isinstance(res, EchoOutput)
    assert res.message == "Mocked response"
    assert res.confidence == 0.99
    del os.environ["LITELLM_MOCK"]


def test_structured_call_validation_and_retry() -> None:
    with patch("litellm.completion") as mock_completion:
        # First attempt returns invalid JSON, second attempt returns valid
        bad_response = MagicMock()
        bad_response.choices = [MagicMock(message=MagicMock(content="not valid json"))]

        good_response = MagicMock()
        good_response.choices = [
            MagicMock(message=MagicMock(content='{"message": "success", "confidence": 1.0}'))
        ]

        mock_completion.side_effect = [bad_response, good_response]

        res = structured_call(
            role="reasoner",
            template_id="sample_echo",
            template_version=1,
            inputs={"text": "retry test"},
            output_model=EchoOutput,
        )
        assert res.message == "success"
        assert res.confidence == 1.0
        assert mock_completion.call_count == 2
