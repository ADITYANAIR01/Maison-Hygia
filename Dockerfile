FROM python:3.14-slim

WORKDIR /app

# Copy pinned dependencies and install them
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY Website/ ./Website/
COPY admin-dashboard/ ./admin-dashboard/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY cli.py ./

# Expose ports
# - 8000: Frontend (static files)
# - 8001: Backend API
EXPOSE 8000 8001

# Default: run Alembic migrations, then the backend API.
# `exec` ensures uvicorn is PID 1 so SIGTERM drains gracefully.
# docker-compose overrides the command per service.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn backend.main:app --host 0.0.0.0 --port 8001"]