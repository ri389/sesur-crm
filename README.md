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
pnpm --filter api user:set-password --email vous@sesur.bj --first-name Prénom --last-name Nom --role ADMIN
pnpm dev:api              # http://localhost:3000/api/health
pnpm dev:web              # http://localhost:18765
```

Si `docker compose up -d` signale un port déjà utilisé (par exemple un PostgreSQL installé sous Windows sur 5432), choisir un port libre dans `.env` : `POSTGRES_PORT=15432` et le même port dans `DATABASE_URL` (idem `REDIS_PORT` / `REDIS_URL`).

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
- `POST /api/auth/login` est limité à 10 tentatives par minute et par IP dans chaque instance API. En production multi-instance, la passerelle doit aussi appliquer une limite partagée. Derrière un proxy maîtrisé, configurez `TRUST_PROXY_HOPS` selon le nombre de proxys de confiance. Définissez `APP_ORIGIN` sur l'origine publique exacte de l'interface web (par exemple `https://crm.exemple.com`, sans chemin), surtout si l'API est derrière un proxy ou sur un domaine distinct. Les requêtes mutantes dont l'en-tête `Origin` ne correspond pas à cette valeur sont refusées.
- Sessions stockées en base (`user_session`, seul le SHA-256 du jeton est conservé) ; expiration après `SESSION_IDLE_MINUTES` d'inactivité (30) ou `SESSION_ABSOLUTE_HOURS` (12).
- Connexions, échecs, verrouillages et déconnexions sont tracés dans `audit_log`.
- Interface web : sans session, `apps/web` affiche la page de connexion ; après connexion, l'espace de travail avec le nom de l'utilisateur et « Se déconnecter ». Le cookie passe par le proxy Vite (`/api` → `:3000`).
- `user:set-password` crée un compte ou redéfinit son mot de passe (saisie masquée) et révoque ses sessions.
- La première exécution attribue `ADMIN` si aucun administrateur actif n'existe ; les autres créations exigent un rôle explicite avec `--role`.

## Intégrations (lot 4)

- Le premier connecteur est un webhook sortant signé. Il s'active quand `INTEGRATION_WEBHOOK_URL` et `INTEGRATION_WEBHOOK_SECRET` sont définis dans `.env`. HTTPS est requis, sauf sur `localhost` pour les essais locaux.
- Les créations de tickets et de contrats sont envoyées dans une boîte d'envoi PostgreSQL transactionnelle. Les événements portent un identifiant de livraison stable ; `Idempotency-Key` permet au destinataire d'éviter les doublons. Les réponses non-2xx ou erreurs réseau sont rejouées avec un délai croissant, jusqu'à `INTEGRATION_RETRY_MAX_ATTEMPTS` (8 par défaut).
- Le destinataire reçoit `X-Sesur-Event`, `X-Sesur-Delivery`, `X-Sesur-Timestamp` et `X-Sesur-Signature`. La signature vaut `sha256=` + HMAC-SHA256 du texte `${timestamp}.${corps-JSON-brut}` avec `INTEGRATION_WEBHOOK_SECRET`. Rejeter les horodatages anciens et conserver l'identifiant de livraison pour l'idempotence.
- La page `#/admin/integrations` affiche les tentatives et permet à l'ADMIN de rejouer un échec définitif. Aucun contenu de contact ou secret n'est inclus dans le corps envoyé.
- Les adaptateurs e-mail, SMS, WhatsApp, calendrier et les webhooks entrants restent à connecter après choix des fournisseurs, des règles de consentement et des coûts.
