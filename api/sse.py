import asyncio
import json
from typing import Any, AsyncGenerator


class SSEBroker:
    """In-memory Server-Sent Events pub/sub broker for realtime browser updates."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    async def subscribe(self) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {data['event']}\ndata: {json.dumps(data['payload'])}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            self._subscribers.discard(queue)

    async def publish(self, event: str, payload: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            await queue.put({"event": event, "payload": payload})


sse_broker = SSEBroker()
