import hashlib
import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

os.environ["LITELLM_TELEMETRY"] = "False"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
import litellm

litellm.telemetry = False
litellm.suppress_debug_info = True

# Default template root relative to project root
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "agents" / "templates"


def load_template(template_id: str, template_version: str | int) -> str:
    """Load prompt template from agents/templates/<template_id>/<version>.md."""
    template_path = TEMPLATES_DIR / template_id / f"{template_version}.md"
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found at {template_path}")
    return template_path.read_text(encoding="utf-8")


def render_template(template_text: str, inputs: dict[str, Any]) -> str:
    """Render a template with variables provided in inputs."""
    rendered = template_text
    for key, value in inputs.items():
        placeholder = f"{{{{{key}}}}}"
        if isinstance(value, (dict, list)):
            val_str = json.dumps(value, indent=2)
        else:
            val_str = str(value)
        rendered = rendered.replace(placeholder, val_str)
    return rendered


def structured_call[T: BaseModel](
    role: str,
    template_id: str,
    template_version: str | int,
    inputs: dict[str, Any],
    output_model: type[T],
    temperature: float = 0.0,
    max_retries: int = 2,
    api_base: str | None = None,
) -> T:
    """Execute a structured LLM call constrained to output_model JSON schema.

    - Resolves role to model (via LiteLLM proxy or local mapping)
    - Validates output against output_model schema
    - Retries up to max_retries with validation error feedback on failure
    """
    template_content = load_template(template_id, template_version)
    prompt = render_template(template_content, inputs)

    # Compute prompt hash for observability/ledger
    _prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()

    schema = output_model.model_json_schema()
    system_instruction = (
        "You are an automated control verification system component. "
        "Strict rule: You MUST output ONLY valid JSON conforming precisely to the following JSON schema:\n"
        f"{json.dumps(schema, indent=2)}\n"
        "Do not include markdown code block ticks, commentary, or text outside the JSON structure."
    )

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt},
    ]

    base_url = api_base or os.environ.get("LITELLM_API_BASE", "http://localhost:4000")
    model_name = os.environ.get(f"MODEL_ROLE_{role.upper()}", role)

    # Check if mock mode is requested or in testing without active LLM
    if os.environ.get("LITELLM_MOCK", "0") == "1":
        # In mock mode, if output_model provides a sample or default
        if hasattr(output_model, "mock_instance"):
            return output_model.mock_instance()  # type: ignore[no-any-return]
        # Otherwise construct with empty/default fields if possible
        try:
            return output_model()  # type: ignore[call-arg]
        except Exception:
            pass

    last_error: str | None = None
    for attempt in range(max_retries + 1):
        if last_error:
            # Append retry instruction with specific schema validation error
            messages.append({
                "role": "user",
                "content": f"Previous output was invalid: {last_error}. Please correct the output to strictly match the JSON Schema.",
            })

        try:
            response: Any = litellm.completion(
                model=model_name,
                messages=messages,
                temperature=temperature,
                api_base=base_url,
                response_format={"type": "json_object"},
            )
            raw_content = response.choices[0].message.content or ""
            parsed = json.loads(raw_content)
            validated = output_model.model_validate(parsed)
            return validated
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = str(e)
            if attempt == max_retries:
                raise ValueError(
                    f"Failed to produce valid structured output for {output_model.__name__} after {max_retries} retries: {last_error}"
                ) from e
        except Exception as e:
            # If litellm fails due to connection refused and mock fallback is allowed
            if "Connection" in str(e) and os.environ.get("LITELLM_FALLBACK_MOCK", "0") == "1":
                if hasattr(output_model, "mock_instance"):
                    return output_model.mock_instance()  # type: ignore[no-any-return]
            raise

    raise RuntimeError("Unexpected termination of structured_call retry loop")
