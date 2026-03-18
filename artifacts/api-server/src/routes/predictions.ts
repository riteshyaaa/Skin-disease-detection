import { Router, type IRouter, type Request, type Response } from "express";
import { db, predictionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  PredictSkinDiseaseBody,
  GetPredictionByIdParams,
} from "@workspace/api-zod";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const SKIN_CONDITIONS = [
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
];

router.post("/predict", async (req: Request, res: Response) => {
  try {
    const parsed = PredictSkinDiseaseBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid request body: imageBase64 is required",
      });
    }

    const { imageBase64, fileName } = parsed.data;

    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const prompt = `You are an expert dermatologist AI assistant. Analyze this skin image carefully and provide a detailed diagnosis.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "disease": "<most likely skin condition name>",
  "confidence": <number between 0.50 and 0.99>,
  "description": "<2-3 sentence clinical description of the condition>",
  "severity": "<one of: normal, mild, moderate, severe>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "differentialDiagnoses": [
    {"disease": "<alternative diagnosis 1>", "confidence": <number>},
    {"disease": "<alternative diagnosis 2>", "confidence": <number>},
    {"disease": "<alternative diagnosis 3>", "confidence": <number>}
  ],
  "preprocessingSteps": ["Image Resizing (224x224)", "Normalization", "Noise Reduction", "Color Enhancement"]
}

Known skin conditions to consider: ${SKIN_CONDITIONS.join(", ")}.
The severity should reflect clinical urgency. Provide exactly 3-5 recommendations and 2-3 differential diagnoses.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI model");
    }

    let analysisResult: {
      disease: string;
      confidence: number;
      description: string;
      severity: string;
      recommendations: string[];
      differentialDiagnoses: { disease: string; confidence: number }[];
      preprocessingSteps: string[];
    };

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
      analysisResult = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    const [saved] = await db
      .insert(predictionsTable)
      .values({
        disease: analysisResult.disease,
        confidence: analysisResult.confidence,
        description: analysisResult.description,
        severity: analysisResult.severity,
        recommendations: analysisResult.recommendations,
        differentialDiagnoses: analysisResult.differentialDiagnoses,
        preprocessingSteps: analysisResult.preprocessingSteps,
        imageBase64: imageBase64.substring(0, 100000),
        fileName: fileName ?? null,
      })
      .returning();

    return res.json({
      id: saved.id,
      disease: saved.disease,
      confidence: saved.confidence,
      description: saved.description,
      severity: saved.severity,
      recommendations: saved.recommendations,
      differentialDiagnoses: saved.differentialDiagnoses,
      preprocessingSteps: saved.preprocessingSteps,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Prediction error:", error);
    return res.status(500).json({
      error: "prediction_failed",
      message:
        error instanceof Error ? error.message : "Failed to analyze image",
    });
  }
});

router.get("/predictions", async (_req: Request, res: Response) => {
  try {
    const predictions = await db
      .select()
      .from(predictionsTable)
      .orderBy(desc(predictionsTable.createdAt))
      .limit(50);

    return res.json({
      predictions: predictions.map((p) => ({
        id: p.id,
        disease: p.disease,
        confidence: p.confidence,
        description: p.description,
        severity: p.severity,
        recommendations: p.recommendations,
        differentialDiagnoses: p.differentialDiagnoses,
        preprocessingSteps: p.preprocessingSteps,
        imageBase64: p.imageBase64,
        fileName: p.fileName,
        createdAt: p.createdAt.toISOString(),
      })),
      total: predictions.length,
    });
  } catch (error) {
    console.error("History fetch error:", error);
    return res.status(500).json({
      error: "fetch_failed",
      message: "Failed to fetch prediction history",
    });
  }
});

router.get("/predictions/:id", async (req: Request, res: Response) => {
  try {
    const parsed = GetPredictionByIdParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_id", message: "Invalid prediction ID" });
    }

    const [prediction] = await db
      .select()
      .from(predictionsTable)
      .where(eq(predictionsTable.id, parsed.data.id))
      .limit(1);

    if (!prediction) {
      return res.status(404).json({ error: "not_found", message: "Prediction not found" });
    }

    return res.json({
      id: prediction.id,
      disease: prediction.disease,
      confidence: prediction.confidence,
      description: prediction.description,
      severity: prediction.severity,
      recommendations: prediction.recommendations,
      differentialDiagnoses: prediction.differentialDiagnoses,
      preprocessingSteps: prediction.preprocessingSteps,
      imageBase64: prediction.imageBase64,
      fileName: prediction.fileName,
      createdAt: prediction.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Prediction fetch error:", error);
    return res.status(500).json({
      error: "fetch_failed",
      message: "Failed to fetch prediction",
    });
  }
});

export default router;
