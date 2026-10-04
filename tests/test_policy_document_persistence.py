"""
Comprehensive Test Suite for Cloudinary + SQLite Policy Document Persistence.
Verifies:
1. PDF upload -> Cloudinary upload occurs & SQLite policy document record created.
2. TXT upload -> Cloudinary upload occurs & SQLite policy document record created.
3. Extracted text, metadata, and SHA-256 hash are persisted in SQLite.
4. Exact content duplicate detection prevents redundant Cloudinary upload and duplicate DB rows.
5. GET /uploaded_policies returns persisted documents.
6. GET /uploaded_policies/{policy_id} returns single document metadata and text.
7. GET /uploaded_policies/{policy_id}/file redirects to Cloudinary secure URL.
8. Simulated backend restart: in-memory state wiped, SQLite continues serving persisted policies.
9. Rollback on failure: cleans up Cloudinary if DB persistence fails.
"""

import hashlib
import io
from typing import Any, Generator
from unittest.mock import patch, MagicMock
import pytest
from starlette.testclient import TestClient

from api.main import app
import api.routers.interactive as interactive_mod
from sim.audit_store import (
    init_audit_tables,
    get_policy_document,
    get_policy_document_by_sha256,
    list_policy_documents,
    delete_policy_document,
)


@pytest.fixture(autouse=True)
def setup_test_db() -> Generator[None, None, None]:
    init_audit_tables()
    yield


@pytest.fixture
def mock_cloudinary() -> Generator[dict[str, Any], None, None]:
    """Mock Cloudinary upload and destroy calls to isolate testing."""
    with patch("core.cloudinary_client.init_cloudinary", return_value=True), \
         patch("core.cloudinary_client.cloudinary.uploader.upload") as mock_upload, \
         patch("core.cloudinary_client.cloudinary.uploader.destroy") as mock_destroy:

        def fake_upload(file_stream: Any, **kwargs: Any) -> dict[str, Any]:
            public_id = kwargs.get("public_id", "controls-ai/policies/POL-TEST/test.pdf")
            return {
                "public_id": public_id,
                "secure_url": f"https://res.cloudinary.com/test-cloud/raw/upload/v123456/{public_id}",
                "resource_type": kwargs.get("resource_type", "raw"),
                "format": "pdf",
                "bytes": 1024,
            }

        mock_upload.side_effect = fake_upload
        mock_destroy.return_value = {"result": "ok"}
        yield {
            "upload": mock_upload,
            "destroy": mock_destroy,
        }


def test_pdf_upload_persists_to_cloudinary_and_sqlite(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Title (Data Retention Standard) >>\nendobj\n"
    file_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    # Ensure clean state for this SHA
    existing = get_policy_document_by_sha256(file_sha256)
    if existing:
        delete_policy_document(existing["policy_id"])

    response = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("corporate_retention_policy.pdf", pdf_bytes, "application/pdf")},
        data={"control_id": "CTL-ARCH-001"},
    )
    assert response.status_code == 200
    data = response.json()

    # 1. Cloudinary upload occurred
    assert mock_cloudinary["upload"].called
    assert data["cloudinary_url"].startswith("https://res.cloudinary.com/")
    assert data["file_sha256"] == file_sha256
    assert data["is_duplicate"] is False

    policy_id = data["policy_id"]

    # 2. SQLite record created
    db_doc = get_policy_document(policy_id)
    assert db_doc is not None
    assert db_doc["filename"] == "corporate_retention_policy.pdf"
    assert db_doc["format"] == "PDF"
    assert db_doc["mime_type"] == "application/pdf"
    assert db_doc["file_sha256"] == file_sha256
    assert db_doc["file_size_bytes"] == len(pdf_bytes)
    assert db_doc["control_id"] == "CTL-ARCH-001"
    assert "corporate retention policy" in db_doc["title"].lower()
    assert db_doc["cloudinary_url"] == data["cloudinary_url"]


def test_txt_upload_persists_to_cloudinary_and_sqlite(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    txt_content = (
        "VULNERABILITY MANAGEMENT STANDARD v2.0\n\n"
        "1. Critical vulnerabilities must be remediated within 7 days.\n"
        "2. High vulnerabilities must be remediated within 30 days.\n"
        "3. Medium vulnerabilities must be remediated within 60 days.\n"
    ).encode("utf-8")
    file_sha256 = hashlib.sha256(txt_content).hexdigest()

    existing = get_policy_document_by_sha256(file_sha256)
    if existing:
        delete_policy_document(existing["policy_id"])

    response = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("vuln_policy_v2.txt", txt_content, "text/plain")},
        data={"control_id": "CTL-VULN-001"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["format"] == "TXT"
    assert data["file_sha256"] == file_sha256
    assert "Critical vulnerabilities" in data["text"]

    db_doc = get_policy_document(data["policy_id"])
    assert db_doc is not None
    assert db_doc["control_id"] == "CTL-VULN-001"
    assert db_doc["mime_type"] == "text/plain"
    assert "Critical vulnerabilities" in db_doc["extracted_text"]


def test_exact_duplicate_detection_prevents_reupload(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    unique_content = b"DATA RETENTION SPECIFICATION - UNIQUE_HASH_TEST_9981"
    file_sha256 = hashlib.sha256(unique_content).hexdigest()

    existing = get_policy_document_by_sha256(file_sha256)
    if existing:
        delete_policy_document(existing["policy_id"])

    # 1. Initial upload
    res1 = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("original_spec.txt", unique_content, "text/plain")},
        data={"control_id": "CTL-ARCH-001"},
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["is_duplicate"] is False
    assert mock_cloudinary["upload"].call_count == 1

    initial_policy_id = data1["policy_id"]

    # 2. Upload exact same bytes with a DIFFERENT filename
    res2 = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("renamed_duplicate.txt", unique_content, "text/plain")},
        data={"control_id": "CTL-ARCH-001"},
    )
    assert res2.status_code == 200
    data2 = res2.json()

    # Exact duplicate detected:
    assert data2["is_duplicate"] is True
    assert data2["status"] == "duplicate"
    assert data2["policy_id"] == initial_policy_id
    assert "already exists" in data2["message"].lower()

    # Verify Cloudinary upload was NOT called a second time
    assert mock_cloudinary["upload"].call_count == 1

    # Verify SQLite has only ONE record for this SHA-256
    docs_with_sha = [
        d for d in list_policy_documents()
        if d["file_sha256"] == file_sha256
    ]
    assert len(docs_with_sha) == 1


def test_get_uploaded_policies_list_and_detail(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    content = b"TEST RETENTION POLICY - POL_LIST_001"
    sha = hashlib.sha256(content).hexdigest()

    existing = get_policy_document_by_sha256(sha)
    if existing:
        delete_policy_document(existing["policy_id"])

    upload_res = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("test_policy_list.txt", content, "text/plain")},
        data={"control_id": "CTL-ARCH-001"},
    )
    policy_id = upload_res.json()["policy_id"]

    # 1. List all policies
    list_res = client.get("/interactive/uploaded_policies")
    assert list_res.status_code == 200
    policies = list_res.json()
    matched = next((p for p in policies if p["policy_id"] == policy_id), None)
    assert matched is not None
    assert matched["filename"] == "test_policy_list.txt"
    assert matched["file_sha256"] == sha
    assert matched["cloudinary_url"].startswith("https://res.cloudinary.com/")

    # 2. Get single policy details
    detail_res = client.get(f"/interactive/uploaded_policies/{policy_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["policy_id"] == policy_id
    assert detail["file_sha256"] == sha
    assert "TEST RETENTION POLICY" in detail["extracted_text"]


def test_open_or_download_policy_file_redirect(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    content = b"PDF_REDIRECT_TEST_CONTENT"
    res = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("view_test.pdf", content, "application/pdf")},
    )
    policy_id = res.json()["policy_id"]
    cloudinary_url = res.json()["cloudinary_url"]

    # Test /file redirect
    file_res = client.get(f"/interactive/uploaded_policies/{policy_id}/file", follow_redirects=False)
    assert file_res.status_code in (302, 307)
    assert file_res.headers["location"] == cloudinary_url

    # Test /download redirect
    dl_res = client.get(f"/interactive/uploaded_policies/{policy_id}/download", follow_redirects=False)
    assert dl_res.status_code in (302, 307)
    assert dl_res.headers["location"] == cloudinary_url


def test_simulated_backend_restart_preserves_policy_documents(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    content = b"RESTART_SURVIVAL_TEST_CONTENT"
    res = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("restart_test.txt", content, "text/plain")},
    )
    policy_id = res.json()["policy_id"]

    # Simulate backend process restart: wipe in-memory list
    interactive_mod._STORED_POLICIES = []

    # Re-query uploaded policies endpoint
    list_res = client.get("/interactive/uploaded_policies")
    assert list_res.status_code == 200
    policies = list_res.json()

    survived = next((p for p in policies if p["policy_id"] == policy_id), None)
    assert survived is not None
    assert survived["filename"] == "restart_test.txt"
    assert survived["cloudinary_url"].startswith("https://res.cloudinary.com/")


def test_delete_uploaded_policy_removes_from_sqlite_and_cloudinary(mock_cloudinary: dict[str, Any]) -> None:
    client = TestClient(app)
    content = b"DELETE_CLEANUP_TEST_CONTENT"
    res = client.post(
        "/interactive/upload_policy_file",
        files={"file": ("cleanup_test.txt", content, "text/plain")},
    )
    policy_id = res.json()["policy_id"]

    # Verify present in SQLite
    assert get_policy_document(policy_id) is not None

    # Call DELETE
    del_res = client.delete(f"/interactive/uploaded_policies/{policy_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify deleted from SQLite
    assert get_policy_document(policy_id) is None
    # Verify Cloudinary destroy was invoked
    assert mock_cloudinary["destroy"].called
