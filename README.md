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
pnpm --filter api user:set-password --email vous@sesur.bj --first-name Prénom --last-name Nom
pnpm dev:api              # http://localhost:3000/api/health
pnpm dev:web              # http://localhost:18765
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

## Authentification

- `POST /api/auth/login` `{ "email", "password" }` : ouvre une session et pose le cookie `sesur_sid` (HttpOnly, Secure, SameSite=Strict, Path=/api).
- `GET /api/auth/me` : utilisateur connecté. `POST /api/auth/logout` : révoque la session et efface le cookie.
- Toutes les routes exigent une session, sauf celles marquées `@Public()` (`/api/health`, login, logout).
- Mots de passe hachés en Argon2id (64 Mio, t=3, p=4) ; nouveaux mots de passe : 12 à 128 caractères.
- Verrouillage après `AUTH_MAX_FAILED_ATTEMPTS` échecs (5) pendant `AUTH_LOCK_MINUTES` (15) ; message d'erreur identique dans tous les cas de refus.
- Sessions stockées en base (`user_session`, seul le SHA-256 du jeton est conservé) ; expiration après `SESSION_IDLE_MINUTES` d'inactivité (30) ou `SESSION_ABSOLUTE_HOURS` (12).
- Connexions, échecs, verrouillages et déconnexions sont tracés dans `audit_log`.
- Interface web : sans session, `apps/web` affiche la page de connexion ; après connexion, l'espace de travail avec le nom de l'utilisateur et « Se déconnecter ». Le cookie passe par le proxy Vite (`/api` → `:3000`).
- `user:set-password` crée un compte ou redéfinit son mot de passe (saisie masquée) et révoque ses sessions.
