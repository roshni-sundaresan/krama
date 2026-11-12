"""Entrypoint: `krama-ai-worker` (or `python -m krama_ai.worker`)."""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from krama_ai.activities import AiActivities
from krama_ai.config import DEFAULT_PRICING, Settings
from krama_ai.gateway import ModelGateway, ModelProvider
from krama_ai.providers.stub import StubProvider


def build_provider(settings: Settings) -> ModelProvider:
    if settings.model_provider == "bedrock":
        from krama_ai.providers.bedrock import BedrockProvider

        return BedrockProvider(settings.aws_region, settings.model_ids, settings.max_output_tokens)
    if settings.model_provider != "stub":
        raise ValueError(f"unknown MODEL_PROVIDER {settings.model_provider!r} (expected stub|bedrock)")
    return StubProvider()


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.from_env()
    gateway = ModelGateway(build_provider(settings), DEFAULT_PRICING)
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    activities = AiActivities(gateway)
    worker = Worker(
        client,
        task_queue=settings.task_queue,
        activities=activities.all(),
        activity_executor=ThreadPoolExecutor(max_workers=8),
    )
    logging.getLogger(__name__).info(
        "krama ai-worker polling %r with provider=%s", settings.task_queue, gateway.provider.name
    )
    await worker.run()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
