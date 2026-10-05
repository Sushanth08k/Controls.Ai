from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/")
def get_root() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "controls-ai-backend",
        "health": "/health",
        "docs": "/docs",
    }


@router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok", "service": "bff-api"}
