"""S3 presigned-upload helpers for product images."""

from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException

from .config import settings

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


def _s3_client():
    return boto3.client("s3", region_name=settings.AWS_REGION)


def presign_upload(key: str, content_type: str, size: int) -> str:
    """Return a presigned PUT URL for an object key."""
    if not settings.S3_ASSETS_BUCKET:
        raise HTTPException(status_code=503, detail="S3 assets bucket not configured")

    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image must be smaller than {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )

    try:
        url = _s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_ASSETS_BUCKET,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Failed to presign upload: {e}")

    return url


def public_url(key: str) -> str:
    """Resolve a stored object key to its public CDN URL."""
    return f"https://{settings.CF_ASSETS_DOMAIN}/{key.lstrip('/')}"


def validate_filename(filename: str) -> str:
    """Validate an uploaded filename's extension and return a safe key name."""
    ext = Path(filename).suffix.lower() or ".png"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    stem = Path(filename).stem
    safe_stem = "".join(c if c.isalnum() or c in "-_." else "-" for c in stem).strip(
        "-"
    )
    if not safe_stem:
        safe_stem = "image"
    return f"{safe_stem}{ext}"


def content_type_for_ext(ext: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")
