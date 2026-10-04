"""
Cloudinary Client Integration for Persistent Policy Document Storage.
Uploads and manages original compliance policy files (PDF, DOCX, TXT)
in Cloudinary using official Cloudinary Python SDK.
"""

import io
import logging
import os
import re
from typing import Any
import cloudinary
import cloudinary.uploader
import cloudinary.api

logger = logging.getLogger(__name__)


def is_cloudinary_configured() -> bool:
    """Check if Cloudinary environment credentials are provided."""
    c_url = os.getenv("CLOUDINARY_URL", "").strip()
    c_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    c_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    c_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    return bool(c_url or (c_name and c_key and c_secret))


def init_cloudinary() -> bool:
    """Initialize Cloudinary configuration from environment variables."""
    c_url = os.getenv("CLOUDINARY_URL", "").strip()
    c_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    c_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    c_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()

    if c_url:
        cloudinary.config(cloudinary_url=c_url, secure=True)
        return True
    elif c_name and c_key and c_secret:
        cloudinary.config(
            cloud_name=c_name,
            api_key=c_key,
            api_secret=c_secret,
            secure=True,
        )
        return True
    return False


def upload_to_cloudinary(
    content_bytes: bytes,
    filename: str,
    policy_id: str,
) -> dict[str, Any]:
    """
    Upload original policy document (PDF, DOCX, TXT) to Cloudinary.
    Uses predictable folder and public_id structure:
    controls-ai/policies/{policy_id}/{clean_filename}

    Returns dictionary with:
    - public_id: Cloudinary public identifier
    - secure_url: HTTPS delivery URL
    - resource_type: "raw" or "auto"
    - format: file extension/format
    - bytes: size in bytes
    """
    if not init_cloudinary():
        raise RuntimeError(
            "Cloudinary credentials not configured. Please ensure CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in environment."
        )

    # Sanitize filename for safe Cloudinary public ID
    clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
    public_id = f"controls-ai/policies/{policy_id}/{clean_name}"

    file_stream = io.BytesIO(content_bytes)
    result = cloudinary.uploader.upload(
        file_stream,
        public_id=public_id,
        resource_type="auto",
        overwrite=True,
        unique_filename=False,
        use_filename=True,
    )

    return {
        "public_id": result.get("public_id", public_id),
        "secure_url": result.get("secure_url", ""),
        "resource_type": result.get("resource_type", "raw"),
        "format": result.get("format", ""),
        "bytes": result.get("bytes", len(content_bytes)),
    }


def delete_from_cloudinary(public_id: str, resource_type: str = "raw") -> bool:
    """Delete an uploaded policy document from Cloudinary."""
    if not public_id:
        return False
    if not init_cloudinary():
        return False

    try:
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
        return True
    except Exception as e:
        logger.warning(f"Failed to delete Cloudinary object '{public_id}': {e}")
        return False
