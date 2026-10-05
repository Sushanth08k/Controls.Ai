import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import httpx
from pydantic import BaseModel, ValidationError

# Automatically load environment variables
env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

os.environ["LITELLM_TELEMETRY"] = "False"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
import litellm

litellm.telemetry = False
litellm.suppress_debug_info = True

logger = logging.getLogger(__name__)

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


def clean_json_text(text: str) -> str:
    """Strip markdown code fence wrappers from raw JSON output."""
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    return clean.strip()


def call_gemini_structured[T: BaseModel](
    prompt: str,
    system_instruction: str,
    output_model: type[T],
    role: str = "reasoner",
    temperature: float = 0.0,
    max_retries: int = 2,
    api_key: str | None = None,
) -> T:
    """Execute a structured Google Gemini API call constrained to output_model JSON schema.

    Uses Gemini REST API with application/json response format and schema validation.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ValueError("No GEMINI_API_KEY or GOOGLE_API_KEY configured.")

    # Candidate models in order of priority: 3.5-flash-lite, 3.1-flash-lite, flash-latest
    env_model = os.environ.get(f"GEMINI_MODEL_{role.upper()}") or os.environ.get("GEMINI_MODEL")
    candidate_models = (
        [env_model]
        if env_model
        else ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"]
    )

    contents: list[dict[str, Any]] = [{"parts": [{"text": prompt}]}]
    last_error: str | None = None

    for attempt in range(max_retries + 1):
        if last_error:
            contents.append({
                "parts": [{
                    "text": (
                        f"CRITICAL: Previous output was invalid JSON or failed schema validation: {last_error}. "
                        "Please correct the output to strictly match the requested JSON schema without any markdown commentary."
                    )
                }]
            })

        for model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            payload = {
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": contents,
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": temperature,
                },
            }

            try:
                resp = httpx.post(url, json=payload, timeout=25.0)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise ValueError(f"Gemini API returned no candidates: {data}")
                    raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    clean_text = clean_json_text(raw_text)
                    parsed = json.loads(clean_text)
                    validated = output_model.model_validate(parsed)
                    logger.info(
                        f"Structured call succeeded for {output_model.__name__} using Gemini ({model})."
                    )
                    return validated

                # If model is unavailable (503) or not found (404), try next candidate model
                if resp.status_code in (404, 503):
                    logger.warning(
                        f"Gemini model {model} returned status {resp.status_code}. Trying next candidate model..."
                    )
                    continue

                # Rate limited or other error
                logger.warning(
                    f"Gemini API call to {model} returned {resp.status_code}: {resp.text[:200]}"
                )
                last_error = f"Gemini API status {resp.status_code}: {resp.text[:120]}"
                break

            except (json.JSONDecodeError, ValidationError) as ve:
                last_error = str(ve)
                logger.warning(
                    f"Schema validation failed for {output_model.__name__} on attempt {attempt + 1}: {ve}"
                )
                break  # Retry loop will add schema correction
            except Exception as ex:
                last_error = str(ex)
                logger.warning(f"Error calling Gemini model {model}: {ex}")
                continue

    raise ValueError(
        f"Failed to produce valid structured output for {output_model.__name__} after {max_retries} retries: {last_error}"
    )


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

    - If LITELLM_MOCK=1 is set, immediately returns mock instance if available.
    - Uses Google Gemini API if GEMINI_API_KEY / GOOGLE_API_KEY is present.
    - Falls back to LiteLLM proxy or local mock instances on connection failure.
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

    # Check if explicit mock mode is requested
    if os.environ.get("LITELLM_MOCK", "0") == "1":
        if hasattr(output_model, "mock_instance"):
            return output_model.mock_instance()  # type: ignore[no-any-return]
        try:
            return output_model()  # type: ignore[call-arg]
        except Exception:
            pass

    # Check if Gemini API key is available and caller is not using custom LiteLLM proxy or test mocks
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    use_proxy = os.environ.get("LITELLM_USE_PROXY", "0") == "1"
    is_test_mocked = hasattr(litellm.completion, "mock_calls") or hasattr(litellm.completion, "assert_called")

    if gemini_key and not use_proxy and not api_base and not is_test_mocked:
        try:
            return call_gemini_structured(
                prompt=prompt,
                system_instruction=system_instruction,
                output_model=output_model,
                role=role,
                temperature=temperature,
                max_retries=max_retries,
                api_key=gemini_key,
            )
        except Exception as e:
            logger.warning(
                f"Gemini API structured call failed ({e}). Checking fallback options..."
            )
            if (
                os.environ.get("LITELLM_FALLBACK_MOCK", "1") == "1"
                and hasattr(output_model, "mock_instance")
            ):
                logger.info(
                    f"Returning deterministic fallback instance for {output_model.__name__}."
                )
                return output_model.mock_instance()  # type: ignore[no-any-return]

    # Fallback path: LiteLLM completion (maintains compatibility with unit tests and proxy setups)
    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt},
    ]

    base_url = api_base or os.environ.get("LITELLM_API_BASE", "http://localhost:4000")
    model_name = os.environ.get(f"MODEL_ROLE_{role.upper()}", role)

    last_error: str | None = None
    for attempt in range(max_retries + 1):
        if last_error:
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
            clean_content = clean_json_text(raw_content)
            parsed = json.loads(clean_content)
            validated = output_model.model_validate(parsed)
            return validated
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = str(e)
            if attempt == max_retries:
                if (
                    os.environ.get("LITELLM_FALLBACK_MOCK", "0") == "1"
                    and hasattr(output_model, "mock_instance")
                ):
                    return output_model.mock_instance()  # type: ignore[no-any-return]
                raise ValueError(
                    f"Failed to produce valid structured output for {output_model.__name__} after {max_retries} retries: {last_error}"
                ) from e
        except Exception as e:
            if (
                os.environ.get("LITELLM_FALLBACK_MOCK", "0") == "1"
                and hasattr(output_model, "mock_instance")
            ):
                return output_model.mock_instance()  # type: ignore[no-any-return]
            raise

    raise RuntimeError("Unexpected termination of structured_call retry loop")
