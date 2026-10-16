# SESUR CRM

CRM interne pour SESUR Bénin : monolithe modulaire NestJS (API) + React/Vite (interface), PostgreSQL et Redis.

## Structure

```
apps/
  api/   API NestJS (préfixe /api)
  web/   Interface React + TypeScript (Vite)
docker-compose.yml   Infrastructure locale (PostgreSQL, Redis)
```

## Démarrage local

Prérequis : Node.js 22+, pnpm (`corepack enable`), Docker.

```bash
cp .env.example .env      # adapter les valeurs, ne jamais committer .env
docker compose up -d
pnpm install
pnpm dev:api              # http://localhost:3000/api/health
pnpm dev:web              # http://localhost:5173
```

## Vérifications

```bash
pnpm lint
pnpm test                 # tests unitaires
pnpm --filter api test:e2e
pnpm build
```
