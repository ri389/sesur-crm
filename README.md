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

- La page Utilisateurs peut envoyer jusqu’à 50 invitations par lot et affiche leur statut. Les e-mails partent via SMTP (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`). `INVITATION_TTL_MINUTES` règle leur durée de validité (15 minutes par défaut ; entre 1 et 43200) ; `APP_ORIGIN` doit pointer vers l’interface web.
- L’inscription se déroule en trois étapes : identité, mot de passe, puis choix de la méthode à deux facteurs. Les étapes terminées sont conservées dans Redis jusqu’à l’expiration de l’invitation ; seul le hachage Argon2id du mot de passe est mis en cache. L’adresse affichée vient de l’invitation et ne peut pas être modifiée.
- `POST /api/auth/invitations/validate` vérifie le lien ; `POST /api/auth/registration-drafts` ouvre ou reprend le brouillon et `POST /api/auth/registration-drafts/save` conserve chaque étape validée. `POST /api/auth/register` crée le compte à partir du brouillon. Le QR code Google Authenticator et le code WhatsApp s’affichent dans le parcours d’inscription.
- `POST /api/auth/verify-code` valide le code TOTP ou WhatsApp et pose le cookie `sesur_sid` (HttpOnly, Secure, SameSite=Strict, Path=/api). `/api/auth/verify-totp` reste disponible comme alias. À la connexion, `/api/auth/login` vérifie le mot de passe et demande le second facteur ; aucune session n’est créée avant la validation du code.
- `GET /api/auth/me` : utilisateur connecté. `POST /api/auth/logout` : révoque la session et efface le cookie.
- Toutes les routes exigent une session, sauf celles marquées `@Public()` (santé, connexion, inscription, validation des invitations et des codes, et déconnexion).
- Mots de passe hachés en Argon2id (64 Mio, t=3, p=4) ; nouveaux mots de passe : 8 à 128 caractères, avec une majuscule, un chiffre et un caractère spécial.
- Les secrets TOTP sont chiffrés en AES-256-GCM avec `TOTP_ENCRYPTION_KEY` (32 octets en base64 ou 64 caractères hexadécimaux). Générez une clé aléatoire dédiée avant le déploiement.
- Verrouillage après `AUTH_MAX_FAILED_ATTEMPTS` échecs (5) pendant `AUTH_LOCK_MINUTES` (15) ; message d'erreur identique dans tous les cas de refus.
- Les étapes d’authentification sont limitées à 10 tentatives par minute et par IP dans chaque instance API. En production multi-instance, la passerelle doit aussi appliquer une limite partagée. Derrière un proxy maîtrisé, configurez `TRUST_PROXY_HOPS` selon le nombre de proxys de confiance. Les requêtes mutantes dont l’en-tête `Origin` ne correspond pas à `APP_ORIGIN` sont refusées.
- Sessions stockées en base (`user_session`, seul le SHA-256 du jeton est conservé) ; expiration après `SESSION_IDLE_MINUTES` d'inactivité (30) ou `SESSION_ABSOLUTE_HOURS` (12).
- Connexions, échecs, verrouillages et déconnexions sont tracés dans `audit_log`.
- Interface web : sans session, `apps/web` affiche la page de connexion ; après connexion, l'espace de travail avec le nom de l'utilisateur et « Se déconnecter ». Le cookie passe par le proxy Vite (`/api` → `:3000`).
- `user:set-password` sert à initialiser ou dépanner un compte (saisie masquée) et révoque ses sessions. Les comptes existants sans facteur actif sont invités à activer Google Authenticator à la première connexion.
- Pour envoyer les invitations avec Gmail, configurez `MAIL_PASSWORD` avec le mot de passe d’application du compte SMTP dans `.env` (ne le commitez jamais). Gardez `MAIL_ENCRYPTION=tls` pour STARTTLS sur le port 587.
- Pour WhatsApp, configurez `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`, `WHATSAPP_OTP_TEMPLATE_NAME` et `WHATSAPP_OTP_TEMPLATE_LANGUAGE` dans `.env`. Le modèle doit être un modèle OTP d’authentification approuvé par Meta, avec le corps et le bouton OTP, et une expiration cohérente avec les cinq minutes du défi. Le numéro est enregistré au format international E.164 (par exemple `+229XXXXXXXX`).
- En développement (`APP_ENV=development`), la suppression d’un utilisateur supprime définitivement son compte, ses sessions, rôles et invitations envoyées. Les événements d’audit restent conservés avec l’UUID historique de l’acteur. Un compte encore référencé par des données métier ne peut pas être supprimé avant réattribution de ces données. Les comptes désactivés par l’ancienne suppression logique sont purgés lors d’une nouvelle invitation à la même adresse, si aucune donnée métier ne les référence. En production, la suppression reste logique.

## Intégrations (lot 4)

- Le premier connecteur est un webhook sortant signé. Il s'active quand `INTEGRATION_WEBHOOK_URL` et `INTEGRATION_WEBHOOK_SECRET` sont définis dans `.env`. HTTPS est requis, sauf sur `localhost` pour les essais locaux.
- Les créations de tickets et de contrats sont envoyées dans une boîte d'envoi PostgreSQL transactionnelle. Les événements portent un identifiant de livraison stable ; `Idempotency-Key` permet au destinataire d'éviter les doublons. Les réponses non-2xx ou erreurs réseau sont rejouées avec un délai croissant, jusqu'à `INTEGRATION_RETRY_MAX_ATTEMPTS` (8 par défaut).
- Le destinataire reçoit `X-Sesur-Event`, `X-Sesur-Delivery`, `X-Sesur-Timestamp` et `X-Sesur-Signature`. La signature vaut `sha256=` + HMAC-SHA256 du texte `${timestamp}.${corps-JSON-brut}` avec `INTEGRATION_WEBHOOK_SECRET`. Rejeter les horodatages anciens et conserver l'identifiant de livraison pour l'idempotence.
- La page `#/admin/integrations` affiche les tentatives et permet à l'ADMIN de rejouer un échec définitif. Aucun contenu de contact ou secret n'est inclus dans le corps envoyé.
- L’authentification WhatsApp passe par la Cloud API Meta ; les intégrations SMS, calendrier et webhooks entrants restent à connecter après choix des fournisseurs, des règles de consentement et des coûts.
