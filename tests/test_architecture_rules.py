import os
import re
from pathlib import Path


def test_no_ctl_literals_in_code() -> None:
    """CI check: No control-specific code (CTL- literals) in core, agents, workflows, tools, api, web."""
    repo_root = Path(__file__).resolve().parent.parent
    check_dirs = ["core", "agents", "workflows", "tools", "api", "web"]
    violations: list[str] = []

    # Match CTL- followed by letters and numbers, e.g. CTL-VULN-001
    pattern = re.compile(r"CTL-[A-Z]+-\d+")

    for dir_name in check_dirs:
        dir_path = repo_root / dir_name
        if not dir_path.exists():
            continue
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", ".venv", "__pycache__", ".git")]
            for file in files:
                if file.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".html")):
                    file_path = Path(root) / file
                    try:
                        content = file_path.read_text(encoding="utf-8")
                        matches = pattern.findall(content)
                        if matches:
                            violations.append(f"{file_path.relative_to(repo_root)}: {matches}")
                    except Exception:
                        pass

    assert not violations, f"Forbidden CTL- literals found in codebase (controls must be data, not code):\n" + "\n".join(violations)


def test_forbidden_dependencies_license_gate() -> None:
    """Ensure no forbidden dependencies (MinIO, HashiCorp Vault, BSL/SSPL/non-commercial) in pyproject.toml."""
    repo_root = Path(__file__).resolve().parent.parent
    pyproject = repo_root / "pyproject.toml"
    assert pyproject.exists(), "pyproject.toml must exist"

    content = pyproject.read_text(encoding="utf-8").lower()
    forbidden = ["minio", "hashicorp", "vault", "temporal-cloud"]
    found = [f for f in forbidden if f in content]
    assert not found, f"Forbidden dependencies found in pyproject.toml: {found}"
