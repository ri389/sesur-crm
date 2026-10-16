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
pnpm --filter api db:deploy   # applique les migrations
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

## Base de données

- Schéma Prisma : `apps/api/prisma/schema.prisma`, migrations versionnées dans `apps/api/prisma/migrations/`.
- Nouvelle migration : `pnpm --filter api db:migrate --name <nom>`.
- Identifiants : UUID v7 générés par l'application ; les numéros lisibles (devis, tickets) viendront de séquences PostgreSQL.
- `audit_log` est en ajout seul : un trigger refuse UPDATE, DELETE et TRUNCATE.
