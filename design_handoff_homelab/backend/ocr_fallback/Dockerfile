# Legg disse linjene inn i din eksisterende Dockerfile (python:3.12-slim eller tilsvarende Debian-basert image)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OCR_FALLBACK=on \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

# Tesseract + norsk og engelsk språkpakke. libgl1/libglib2.0-0 trengs av OpenCV.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-nor \
        tesseract-ocr-eng \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Sjekk at norsk er installert ved bygging
RUN tesseract --list-langs | grep -q nor

CMD ["python", "main.py"]
