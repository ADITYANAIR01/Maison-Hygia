FROM python:3.14-slim

WORKDIR /app

# Copy package files
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir fastapi uvicorn sqlalchemy psycopg2-binary pydantic stripe httpx 2>/dev/null && \
    pip freeze | grep -E "fastapi|uvicorn|sqlalchemy|psycopg2|pydantic|stripe|httpx" > /app/requirements.txt

# Copy backend
COPY backend/ ./backend/

# Copy frontend assets
COPY Website/ ./Website/
COPY serve_frontend.py ./

# Expose ports
# - 8000: Frontend (static files)
# - 8001: Backend API
EXPOSE 8000 8001

# Start both backend and frontend
# The frontend server proxies /api, /cart, /payment to the backend on 8001.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port 8001 & python3 serve_frontend.py 8000 & wait"]