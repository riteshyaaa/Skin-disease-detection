# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: FastAPI (Python 3.11) — replaces original Node.js/Express
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 vision model)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── skin-ai/            # React + Vite frontend (Skin Disease Detection AI)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Application: DermAI — Skin Disease Detection

Full-stack AI-powered skin disease detection application.

### Features
- Upload skin images via drag-and-drop or file picker
- AI analysis using OpenAI GPT-5.2 vision model
- Returns: disease name, confidence score, severity, recommendations, differential diagnoses
- Image preprocessing steps shown (resize, normalize, noise reduction)
- Prediction history with past analyses
- Medical-grade dashboard UI with clinical aesthetic

### API Routes
- `POST /api/predict` — Upload base64 image, get disease prediction
- `GET /api/predictions` — Get prediction history
- `GET /api/predictions/:id` — Get specific prediction

### Database Schema
- `predictions` table: stores disease, confidence, severity, recommendations, differentialDiagnoses, preprocessingSteps, imageBase64, fileName, createdAt

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Packages

### `artifacts/skin-ai` (`@workspace/skin-ai`)

React + Vite frontend. Medical dashboard for skin disease detection.
- Pages: Home (upload + results), History, Detail
- Uses: react-dropzone, framer-motion, date-fns, @workspace/api-client-react

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with OpenAI integration.
- Routes: `/api/healthz`, `/api/predict`, `/api/predictions`
- Uses: openai, @workspace/db, @workspace/api-zod

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.
- Schema: `predictions` table

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI spec + Orval codegen config.
