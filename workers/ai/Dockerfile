# Python AI worker (Temporal activities on task queue "ai").
# Build context: workers/ai.  docker build workers/ai
FROM python:3.13.9-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir . && useradd --create-home --uid 10001 krama
USER krama
CMD ["krama-ai-worker"]
