import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from api.routers import controls, evidence, findings, gates, health, interactive, runs, vulnerability
from api.sse import sse_broker
from sim.database import init_real_databases, seed_databases

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure SQLite databases and baseline records exist upon startup on Render / cloud platforms
    try:
        init_real_databases()
        logger.info("Database schemas and seed data initialized successfully.")
    except Exception as e:
        logger.warning(f"Database auto-seeding warning on startup: {e}")
    yield


app = FastAPI(
    title="Agentic Control Automation Platform BFF",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(controls.router)
app.include_router(runs.router)
app.include_router(gates.router)
app.include_router(findings.router)
app.include_router(evidence.router)
app.include_router(interactive.router)
app.include_router(vulnerability.router)

# Also expose under /api prefix for proxy resilience
app.include_router(health.router, prefix="/api")
app.include_router(controls.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(gates.router, prefix="/api")
app.include_router(findings.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(interactive.router, prefix="/api")
app.include_router(vulnerability.router, prefix="/api")


@app.get("/events")
@app.get("/api/events")
async def events_stream() -> StreamingResponse:
    """Server-Sent Events endpoint streaming realtime platform updates."""
    return StreamingResponse(
        sse_broker.subscribe(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
