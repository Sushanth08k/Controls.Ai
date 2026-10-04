import io
import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app
from sim.audit_store import (
    init_audit_tables,
    get_connection,
    upsert_audit_run,
    get_full_audit_bundle,
    get_policy_document,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db() -> None:
    init_audit_tables()


def test_duplicate_upload_detection_and_message() -> None:
    """Verify SHA-256 duplicate detection returns is_duplicate: True and clear message without second Cloudinary/SQLite record."""
    unique_key = uuid.uuid4().hex[:8]
    policy_content = f"TEST REPEATABLE POLICY CONTENT FOR DEDUPLICATION {unique_key}\nSection 1: All passwords must rotate 90 days.".encode()
    file_name = f"test_dup_policy_{unique_key}.txt"

    mock_cloud = {
        "public_id": "test_dup_public_id",
        "secure_url": "https://res.cloudinary.com/test/raw/upload/v1234/test_dup_policy.txt",
    }

    with patch("api.routers.interactive.upload_to_cloudinary", return_value=mock_cloud):
        # 1. First upload
        res1 = client.post(
            "/interactive/upload_policy_file",
            files={"file": (file_name, io.BytesIO(policy_content), "text/plain")},
            data={"control_id": "CTL-VULN-001"},
        )
        assert res1.status_code == 200, res1.text
        data1 = res1.json()
        assert data1["is_duplicate"] is False
        policy_id = data1["policy_id"]

        # 2. Duplicate upload of identical content
        res2 = client.post(
            "/interactive/upload_policy_file",
            files={"file": (file_name, io.BytesIO(policy_content), "text/plain")},
            data={"control_id": "CTL-VULN-001"},
        )
        assert res2.status_code == 200, res2.text
        data2 = res2.json()
        assert data2["is_duplicate"] is True
        assert data2["policy_id"] == policy_id
        assert "already exists" in data2["message"]

        # 3. Verify exactly ONE record exists in SQLite for this SHA-256
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM compliance_policy_documents WHERE file_sha256 = ?",
                (data1["file_sha256"],)
            )
            count = cur.fetchone()[0]
            assert count == 1, f"Expected 1 record, got {count}"
        finally:
            conn.close()


def test_control_run_policy_traceability_archetype_d() -> None:
    """Verify that an Archetype D run binds the exact policy used and resolves it in /runs and /runs/{run_id}/audit."""
    mock_cloud = {
        "public_id": "test_archival_pid",
        "secure_url": "https://res.cloudinary.com/demo/raw/upload/v1/test_archival.pdf",
    }

    key = uuid.uuid4().hex[:6]
    fname = f"ARCHIVAL_POLICY_{key}.txt"
    with patch("api.routers.interactive.upload_to_cloudinary", return_value=mock_cloud):
        # Ingest a distinct policy document
        up_res = client.post(
            "/interactive/upload_policy_file",
            files={"file": (fname, io.BytesIO(f"RETENTION POLICY STANDARD {key}\nRetain transaction records for 7 years.".encode()), "text/plain")},
            data={"control_id": "CTL-ARCH-001"},
        )
        assert up_res.status_code == 200
        policy_id = up_res.json()["policy_id"]

        # Step 1: Interpret policy passing the exact policy_id
        interp_res = client.post(
            "/interactive/interpret",
            json={
                "control_id": "CTL-ARCH-001",
                "document_text": f"RETENTION POLICY STANDARD {key}\nRetain transaction records for 7 years.",
                "filename": fname,
                "policy_id": policy_id,
            }
        )
        assert interp_res.status_code == 200
        run_id = interp_res.json()["run_id"]
        assert interp_res.json()["policy_id"] == policy_id

        # Inspect run list
        runs_res = client.get("/runs")
        assert runs_res.status_code == 200
        run_items = runs_res.json()
        target_run = next((r for r in run_items if r["run_id"] == run_id), None)
        assert target_run is not None
        assert target_run["policy_id"] == policy_id
        assert target_run["policy_filename"] == fname
        assert target_run["policy_used"] is not None
        assert target_run["policy_used"]["policy_id"] == policy_id
        assert target_run["policy_used"]["cloudinary_url"] == mock_cloud["secure_url"]

        # Inspect full audit bundle
        audit_res = client.get(f"/runs/{run_id}/audit")
        assert audit_res.status_code == 200
        bundle = audit_res.json()
        assert bundle["policy_used"] is not None
        assert bundle["policy_used"]["policy_id"] == policy_id
        assert bundle["policy_used"]["filename"] == fname
        assert bundle["policy_used"]["cloudinary_url"] == mock_cloud["secure_url"]

        # Verify file redirect endpoint works
        file_res = client.get(f"/interactive/uploaded_policies/{policy_id}/file", follow_redirects=False)
        assert file_res.status_code == 307
        assert file_res.headers["location"] == mock_cloud["secure_url"]


def test_control_run_policy_traceability_archetype_a() -> None:
    """Verify that an Archetype A (vulnerability) run binds the exact policy used."""
    mock_cloud = {
        "public_id": "test_vuln_pid",
        "secure_url": "https://res.cloudinary.com/demo/raw/upload/v1/vuln_policy.txt",
    }
    key = uuid.uuid4().hex[:6]
    fname = f"vuln_policy_spec_{key}.txt"

    with patch("api.routers.interactive.upload_to_cloudinary", return_value=mock_cloud):
        up_res = client.post(
            "/interactive/upload_policy_file",
            files={"file": (fname, io.BytesIO(f"VULN POLICY {key}\nCritical: 7 days.".encode()), "text/plain")},
            data={"control_id": "CTL-VULN-001"},
        )
        assert up_res.status_code == 200
        policy_id = up_res.json()["policy_id"]

        exec_res = client.post(
            "/vulnerability/execute",
            json={
                "control_id": "CTL-VULN-001",
                "policy_id": policy_id,
                "filename": fname,
            }
        )
        assert exec_res.status_code == 200
        run_id = exec_res.json()["run_id"]

        # Check audit bundle
        audit_res = client.get(f"/runs/{run_id}/audit")
        assert audit_res.status_code == 200
        bundle = audit_res.json()
        assert bundle["policy_used"] is not None
        assert bundle["policy_used"]["policy_id"] == policy_id
        assert bundle["policy_used"]["filename"] == fname


def test_run_predating_policy_feature_shows_none() -> None:
    """Verify that a historical run with no policy record returns policy_used: None ('Policy Used: Not recorded')."""
    old_run_id = "RUN-LEGACY-001"
    upsert_audit_run(
        run_id=old_run_id,
        control_id="CTL-LEGACY-001",
        version="0.9.0",
        archetype="A",
        status="completed",
        started_at="2024-01-01T00:00:00Z",
    )

    bundle = get_full_audit_bundle(old_run_id)
    assert bundle is not None
    assert bundle.get("policy_used") is None
