import asyncio
import os
from temporalio.client import Client
from temporalio.worker import Worker
from workflows.supervisor_wf import SupervisorWorkflow

TASK_QUEUE = "controls-task-queue"


async def run_worker() -> None:
    temporal_host = os.environ.get("TEMPORAL_HOST", "localhost:7233")
    client = await Client.connect(temporal_host)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[SupervisorWorkflow],
        activities=[],
    )
    print(f"Starting Temporal worker on task queue '{TASK_QUEUE}'...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
