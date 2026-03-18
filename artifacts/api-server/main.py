"""
DermAI - Skin Disease Detection API
Python FastAPI Backend
Replaces the original Node.js/Express server.
"""

import os
import json
import re
from typing import Optional
from datetime import datetime

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DermAI API",
    description="Skin Disease Detection using AI - Python FastAPI Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# OpenAI client (uses Replit AI Integrations proxy)
# ---------------------------------------------------------------------------

openai_client = OpenAI(
    base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL"),
    api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
)

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")


def get_connection():
    """Open a new PostgreSQL connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def ensure_table():
    """Create the predictions table if it doesn't already exist."""
    create_sql = """
        CREATE TABLE IF NOT EXISTS predictions (
            id               SERIAL PRIMARY KEY,
            disease          TEXT        NOT NULL,
            confidence       REAL        NOT NULL,
            description      TEXT        NOT NULL,
            severity         TEXT        NOT NULL,
            recommendations          JSONB       NOT NULL DEFAULT '[]',
            differential_diagnoses   JSONB       NOT NULL DEFAULT '[]',
            preprocessing_steps      JSONB       NOT NULL DEFAULT '[]',
            image_base64     TEXT,
            file_name        TEXT,
            created_at       TIMESTAMP   NOT NULL DEFAULT NOW()
        )
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(create_sql)
        conn.commit()
    finally:
        conn.close()


# Run on startup
ensure_table()

# ---------------------------------------------------------------------------
# Known skin conditions the AI should consider
# ---------------------------------------------------------------------------

SKIN_CONDITIONS = [
    "Melanoma",
    "Basal Cell Carcinoma",
    "Squamous Cell Carcinoma",
    "Acne Vulgaris",
    "Eczema (Atopic Dermatitis)",
    "Psoriasis",
    "Rosacea",
    "Tinea (Ringworm)",
    "Seborrheic Dermatitis",
    "Contact Dermatitis",
    "Urticaria (Hives)",
    "Vitiligo",
    "Normal Healthy Skin",
]

# ---------------------------------------------------------------------------
# Pydantic models (request / response)
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    imageBase64: str
    fileName: Optional[str] = None
    imageUrl: Optional[str] = None


class DifferentialDiagnosis(BaseModel):
    disease: str
    confidence: float


class PredictionResult(BaseModel):
    id: int
    disease: str
    confidence: float
    description: str
    severity: str
    recommendations: list[str]
    differentialDiagnoses: list[DifferentialDiagnosis]
    preprocessingSteps: list[str]
    createdAt: str


class PredictionRecord(PredictionResult):
    imageBase64: Optional[str] = None
    fileName: Optional[str] = None


class PredictionHistoryResponse(BaseModel):
    predictions: list[PredictionRecord]
    total: int


class HealthStatus(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Helper: convert a DB row (dict) to PredictionRecord
# ---------------------------------------------------------------------------


def row_to_record(row: dict) -> dict:
    return {
        "id": row["id"],
        "disease": row["disease"],
        "confidence": row["confidence"],
        "description": row["description"],
        "severity": row["severity"],
        "recommendations": row["recommendations"] or [],
        "differentialDiagnoses": row["differential_diagnoses"] or [],
        "preprocessingSteps": row["preprocessing_steps"] or [],
        "imageBase64": row.get("image_base64"),
        "fileName": row.get("file_name"),
        "createdAt": row["created_at"].isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/healthz", response_model=HealthStatus, tags=["health"])
def health_check():
    """Server health check."""
    return {"status": "ok"}


@app.post("/api/predict", response_model=PredictionResult, tags=["predictions"])
def predict_skin_disease(body: PredictRequest):
    """
    Accept a base64-encoded skin image, send it to GPT-5.2 Vision,
    parse the structured JSON response, persist to DB, and return the result.
    """
    image_base64 = body.imageBase64

    # Build a proper data-URL if the caller didn't include the prefix
    if image_base64.startswith("data:"):
        image_url = image_base64
    else:
        image_url = f"data:image/jpeg;base64,{image_base64}"

    prompt = f"""You are an expert dermatologist AI assistant. Analyze this skin image carefully and provide a detailed diagnosis.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{{
  "disease": "<most likely skin condition name>",
  "confidence": <number between 0.50 and 0.99>,
  "description": "<2-3 sentence clinical description of the condition>",
  "severity": "<one of: normal, mild, moderate, severe>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "differentialDiagnoses": [
    {{"disease": "<alternative diagnosis 1>", "confidence": <number>}},
    {{"disease": "<alternative diagnosis 2>", "confidence": <number>}},
    {{"disease": "<alternative diagnosis 3>", "confidence": <number>}}
  ],
  "preprocessingSteps": ["Image Resizing (224x224)", "Normalization", "Noise Reduction", "Color Enhancement"]
}}

Known skin conditions to consider: {", ".join(SKIN_CONDITIONS)}.
The severity should reflect clinical urgency. Provide exactly 3-5 recommendations and 2-3 differential diagnoses."""

    # Call GPT-5.2 Vision
    try:
        response = openai_client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI model error: {exc}") from exc

    content = response.choices[0].message.content
    if not content:
        raise HTTPException(status_code=500, detail="No response from AI model")

    # Strip markdown code fences if the model wraps JSON in them
    cleaned = re.sub(r"```(?:json)?\n?|\n?```", "", content).strip()

    try:
        analysis = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {exc}") from exc

    # Persist to database
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO predictions
                    (disease, confidence, description, severity,
                     recommendations, differential_diagnoses, preprocessing_steps,
                     image_base64, file_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    analysis["disease"],
                    float(analysis["confidence"]),
                    analysis["description"],
                    analysis["severity"],
                    json.dumps(analysis.get("recommendations", [])),
                    json.dumps(analysis.get("differentialDiagnoses", [])),
                    json.dumps(analysis.get("preprocessingSteps", [])),
                    image_base64[:100_000],          # cap stored size
                    body.fileName,
                ),
            )
            saved = dict(cur.fetchone())
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        conn.close()

    return {
        "id": saved["id"],
        "disease": saved["disease"],
        "confidence": saved["confidence"],
        "description": saved["description"],
        "severity": saved["severity"],
        "recommendations": saved["recommendations"] or [],
        "differentialDiagnoses": saved["differential_diagnoses"] or [],
        "preprocessingSteps": saved["preprocessing_steps"] or [],
        "createdAt": saved["created_at"].isoformat(),
    }


@app.get("/api/predictions", response_model=PredictionHistoryResponse, tags=["predictions"])
def get_prediction_history():
    """Return the 50 most recent predictions."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM predictions ORDER BY created_at DESC LIMIT 50"
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    records = [row_to_record(dict(r)) for r in rows]
    return {"predictions": records, "total": len(records)}


@app.get("/api/predictions/{prediction_id}", response_model=PredictionRecord, tags=["predictions"])
def get_prediction_by_id(prediction_id: int):
    """Return a single prediction by ID."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM predictions WHERE id = %s LIMIT 1",
                (prediction_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Prediction not found")

    return row_to_record(dict(row))


# ---------------------------------------------------------------------------
# Entry point (for local dev: python main.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
