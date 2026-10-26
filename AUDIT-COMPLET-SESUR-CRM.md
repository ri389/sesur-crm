# Audit complet — SESUR CRM

**Date :** 26 octobre 2026  
**Périmètre :** dépôt complet, incluant les 10 fichiers déjà modifiés localement au début de l’audit.  
**Nature :** audit statique du code, des migrations, de la configuration, des tests et comparaison avec le document d’architecture fourni, suivi d’une passe de correction.

## Suivi des corrections

Les corrections suivantes ont été appliquées après l’audit :

- **Opportunités :** date `expectedCloseDate`, montant décimal transmis comme chaîne, type de création sans étape obligatoire, lecture du tableau `data` et navigation paginée alignés entre l’API et l’interface.
- **Devis :** les listes, détails, modifications, soumissions et décisions d’approbation appliquent le scope de l’utilisateur ; les écritures de devis et leur audit sont transactionnels.
- **Premier compte :** les rôles RBAC sont initialisés par le script ; `ADMIN` est attribué si aucun administrateur actif n’existe, et le README demande explicitement ce rôle au bootstrap.
- **Prospects :** la recherche et les alertes de doublons respectent le périmètre d’équipe ; l’attribution d’un prospect est contrôlée selon le scope.
- **Connexion :** limite de 10 tentatives par minute et par IP dans chaque instance, vérification d’origine pour les requêtes mutantes et en-têtes HTTP de sécurité.
- **Fusions :** les références des opportunités, devis, tâches et événements sont transférées avant la suppression logique ; fusion et audit partagent une transaction.
- **Audit et rôles :** les mises à jour prospect/contact/organisation n’enregistrent plus les valeurs personnelles, et l’audit est atomique avec ces modifications ; la mise à jour des rôles utilisateur est transactionnelle.
- **Tâches et agenda (lot 2) :** API protégée par des scopes OWN/TEAM/ALL, création, consultation, modification et archivage logique, contrôles des responsables et enregistrements liés, journalisation transactionnelle. Les écrans permettent de créer, suivre l’état et archiver les tâches et événements ; l’agenda propose des vues jour/semaine/mois avec regroupement par jour.
- **Opportunités et recherche :** la clôture « Perdue » demande un motif dans le pipeline et la fiche détaillée, et l’API le rend obligatoire. La recherche globale retrouve aussi les opportunités visibles par l’utilisateur selon son scope.
- **Permissions locales :** les rôles système de la base locale ont été resynchronisés avec les nouveaux droits `task` et `calendar`.
- **Lot 3 - support :** tickets SAV (file filtrable, statuts, priorité, commentaires, historique, échéances SLA calculées par priorité et escalade automatique après dépassement de résolution) et contrats (valeur, client, dates, filtres d’échéance, alerte visuelle à 30 jours). Migration appliquée et rôles SAV/Direction/Responsable commercial configurés.
- **Lot 4 - intégrations (première tranche) :** boîte d’envoi PostgreSQL transactionnelle, webhook sortant HMAC-SHA256, clé d’idempotence, reprises avec délai croissant, historique des tentatives, audit, replay des échecs définitifs par ADMIN et écran de suivi. Les créations de ticket et contrat émettent des événements non sensibles.

Restent à traiter ou à définir : validation des seuils SLA provisoires et du calendrier de service, notifications push/e-mail et stockage des pièces jointes tickets/contrats, pagination des listes prospects/organisations/contacts/utilisateurs, politique de conservation des journaux, règles fiscales/versionnement et envoi des devis, fournisseurs des connecteurs e-mail/SMS/WhatsApp/calendrier, webhooks entrants et lot 5 (marketing/scoring). Les tâches/agenda restent une première version ; l’édition détaillée et une grille calendrier visuelle restent à compléter. Les écritures hors des chemins précisés ci-dessus peuvent encore échouer séparément de leur journal d’audit.

## Synthèse

Le projet a une base technique cohérente pour un CRM interne : monolithe NestJS découpé par domaines, React/TypeScript, PostgreSQL/Prisma, migrations versionnées, validation globale des DTO, RBAC centralisé, mots de passe Argon2id, sessions opaques côté serveur et journal d’audit en ajout seul.

**Le dépôt n’est toutefois pas prêt à être déployé avec des données réelles.** L’audit initial a relevé des contrats Opportunités désalignés, des contrôles de périmètre manquants et une procédure de bootstrap incomplète ; les défauts applicatifs correspondants ont été corrigés dans la passe de suivi. Les premiers parcours tâches/agenda ont été ajoutés depuis. La limitation de connexion ajoutée est locale à chaque instance et ne remplace pas une limite partagée à la passerelle de production. Plusieurs composants d’exploitation et plusieurs lots du produit restent absents du dépôt.

Le document d’architecture annonce environ 55–60 écrans et les lots 1 à 5. Le code couvre une partie des lots 1 et 2 ; le lot 3 dispose d’une base tickets/contrats et d’automatismes SLA. Le lot 4 a un premier connecteur webhook sortant et un worker local à l’API, mais pas encore les adaptateurs e-mail, SMS, WhatsApp ou calendrier ni les webhooks entrants. Le marketing, le scoring et le reporting avancé restent absents. Le document fourni est une proposition version 0.1 « à valider » : ces écarts mesurent l’avancement par rapport à la cible proposée, pas une exigence contractuelle confirmée.

## Constats prioritaires

### P1 — À corriger avant merge ou exposition à des utilisateurs

#### 1. Le contrat Opportunités est incohérent et risque de bloquer les builds

- Le DTO backend de création expose `closeDate` dans `apps/api/src/opportunities/dto/create-opportunity.dto.ts:34`, alors que `apps/api/src/opportunities/opportunities.service.ts:134-135` lit `expectedCloseDate`. La propriété n’existe pas sur le DTO courant.
- Le client déclare `Opportunity.closeDate` et exige `stage` dans `apps/web/src/api.ts:209-229`. L’interface lit `opp.expectedCloseDate` dans `apps/web/src/pages/CrmPages.tsx:811,964`, et le formulaire construit le DTO sans `stage` dans `CrmPages.tsx:869-875`. Ces références sont incompatibles avec les types présents.
- L’API renvoie `{ data, pagination }` dans `opportunities.service.ts:237-245`. Le client de liste n’accepte qu’un tableau ou un objet contenant `results` dans `CrmPages.tsx:722-731` : la liste ignore donc la réponse actuelle et reste vide.
- Le formulaire envoie `amount` comme nombre. Le backend valide ce champ comme chaîne avec `@IsString()` et `@Matches()` dans `apps/api/src/opportunities/dto/create-opportunity.dto.ts:22-24`. Avec la validation actuelle, la création risque d’être rejetée en 400.

**Action :** fixer un seul contrat partagé ou généré depuis OpenAPI, puis aligner le champ de date, la création et la pagination. Représenter les montants comme chaînes décimales sur le fil HTTP si le serveur les valide ainsi.

#### 2. Les règles TEAM des devis ne protègent pas les enregistrements

Le rôle `SALES_REP` reçoit `quote:read/create/update` avec le scope `TEAM` (`apps/api/src/auth/rbac.ts:104-115`). Pourtant, `QuotesController` ne transmet pas l’utilisateur aux lectures (`quotes.controller.ts:34-43`) et `QuotesService.findAll/findOne` ne filtrent pas par créateur ou équipe (`quotes.service.ts:406-426`). `update` reçoit `userId`, mais ne l’utilise pas pour autoriser l’accès à la fiche (`quotes.service.ts:112-131`). `submitForApproval` vérifie l’état du devis, pas son propriétaire ni son équipe (`quotes.service.ts:192-260`).

Un commercial autorisé sur ses devis peut ainsi consulter les devis d’autres équipes et modifier ou soumettre le brouillon d’un autre utilisateur. Pour une donnée commerciale et financière, c’est un défaut d’autorisation majeur.

**Action :** transmettre l’utilisateur aux opérations quote, filtrer les listes/détails par scope, et faire les vérifications d’accès dans la même transaction que la modification ou la soumission.

#### 3. La procédure d’installation ne donne pas de rôle au premier utilisateur

Le README crée le compte avec `user:set-password` sans option `--role` (`README.md:23`). Le script ne lance `seedRbac` et n’assigne un rôle que si `values.role` est fourni (`apps/api/src/scripts/set-password.ts:126-147`). Un utilisateur créé par la procédure documentée a donc `roles: []` et `permissions: []`. Il peut ouvrir sa session, mais ne peut pas administrer l’application ni s’attribuer des droits via l’API.

**Action :** rendre explicite et reproductible l’amorçage du rôle ADMIN, avec contrôle qu’il existe un administrateur actif, puis corriger les commandes du README.

#### 4. Les endpoints de prospects contournent le périmètre TEAM pendant la découverte

`SearchService` vérifie seulement l’existence d’une permission `lead:read`, puis cherche dans tous les prospects sans appliquer `leadScopeWhere` (`apps/api/src/crm-core/search/search.service.ts:17-39`). En outre, `LeadService.create` appelle la recherche de doublons globale (`lead.service.ts:94-114`) ; le 409 renvoie les candidats, et `DuplicateService` place notamment l’adresse e-mail correspondante dans `reason` (`duplicates/duplicate.service.ts:111-152`).

Un commercial limité à son équipe peut donc obtenir des noms, sociétés et adresses e-mail de prospects d’autres équipes via la recherche ou la réponse de doublon.

**Action :** appliquer le scope aux deux chemins, ou définir une politique de détection globale qui ne divulgue pas les données hors périmètre.

#### 5. La connexion n’a aucune limitation de débit côté application

Le verrouillage est lié au compte (`apps/api/src/auth/lockout.ts`), mais aucune limitation par IP, route ou capacité globale n’est configurée dans `main.ts` / `app.setup.ts`. Chaque tentative lance une vérification Argon2, y compris pour un compte inconnu. Un attaquant peut saturer les ressources de l’API ou verrouiller à distance un compte ciblé. Le dépôt ne contient pas non plus de configuration de proxy de production démontrant une limitation équivalente.

**Action :** ajouter une limite de débit robuste (route et source), garder le verrouillage de compte comme défense complémentaire et définir les en-têtes de sécurité ainsi que la validation Origin/CSRF pour l’environnement déployé. Le cookie `HttpOnly`, `Secure` par défaut et `SameSite=Strict` est un bon socle, mais ne remplace pas ces contrôles.

### P2 — Risque de données, de confidentialité ou de fiabilité

#### 6. La fusion de fiches ne rattache pas les données du lot 2

Lors d’une fusion d’organisation, le service rattache contacts, prospects et interactions, puis supprime logiquement l’organisation doublon (`apps/api/src/crm-core/duplicates/duplicate.service.ts:297-322`). Il ne rattache pas les opportunités, devis, tâches ou événements d’agenda qui référencent cette organisation. La fusion de contacts omet également plusieurs relations du lot 2 (`duplicate.service.ts:259-286`). Les données restent en base mais sont associées à une fiche désactivée et deviennent invisibles depuis la fiche conservée.

**Action :** recenser toutes les relations Prisma pour chaque type de fusion et les transférer dans une transaction avant la suppression logique.

#### 7. Le journal d’audit conserve des données personnelles sans durée de rétention

Les mises à jour prospect/contact/organisation enregistrent les valeurs du DTO complet dans `metadata` (`lead.service.ts:187-193`, `contact.service.ts:132-138`, `organization.service.ts:130-138`). Cela peut dupliquer e-mails, téléphones et adresses dans le journal. La migration rend le journal non modifiable/non supprimable ; aucune politique de minimisation ou de purge/archivage n’est décrite. De plus, les écritures métier sont généralement validées avant `audit.record`, ce qui permet un changement sans entrée d’audit si l’écriture du journal échoue.

**Action :** journaliser les champs modifiés et les identifiants nécessaires plutôt que les valeurs personnelles, définir une politique de conservation compatible avec l’immutabilité voulue et rendre l’écriture métier/audit atomique ou via outbox.

#### 8. Plusieurs listes ne sont pas paginées et la recherche peut croître en coût

Les listes de prospects, organisations, contacts et utilisateurs renvoient toutes les lignes actives (`lead.service.ts:30-66`, `organization.service.ts:22-45`, `contact.service.ts:19-45`, `users.service.ts:34-40`). Les filtres `contains` utilisent des recherches partielles ; les index B-tree existants ne suffisent pas forcément à les accélérer à grande échelle. La détection de doublons charge toutes les organisations pour comparer leur nom en mémoire (`duplicate.service.ts:198-219`).

**Action :** ajouter pagination/limites serveur, mesurer les requêtes et choisir des index adaptés à la recherche partielle (ou une stratégie plein texte) avant la montée en volume.

#### 9. Une fusion et une modification utilisateur peuvent laisser des états partiels

Dans `UsersService.update`, les rôles sont supprimés dans une requête séparée avant l’update utilisateur (`users.service.ts:99-117`). En cas d’échec de la seconde opération, l’utilisateur perd ses rôles. Plusieurs services écrivent les données métier puis l’audit séparément ; la réponse peut échouer après que la donnée a été changée. Ces cas sont particulièrement sensibles pour des opérations administratives.

**Action :** déplacer ces opérations dans des transactions Prisma et couvrir les échecs intermédiaires.

#### 10. Le cycle de vie devis/prix est incomplet par rapport au modèle prévu

Le taux de taxe est codé en dur à 18 % (`quotes.service.ts:46`) alors que les paramètres fiscaux sont envisagés dans l’architecture. Le modèle stocke `version`, mais le service modifie uniquement les brouillons en place et ne crée pas de nouvelle version. Aucun parcours d’envoi, PDF, acceptation/refus client ou historique de version exploitable n’est présent. Les devis ne sont pas reliés à une opportunité dans le DTO/service actuel.

**Action :** valider les règles de prix et taxes, puis préciser le workflow complet et sa gestion des versions avant utilisation réelle.

### P3 — Écart de périmètre et qualité de livraison

- Le code couvre surtout CRM cœur, catalogue, utilisateurs, opportunités et une partie des devis. Les tâches/agenda et les tickets/contrats ont une première version applicative. Le moteur SLA utilise des heures calendaires provisoires ; pièces jointes, consentements et campagnes restent absents. Le lot 4 dispose d’une file PostgreSQL et d’un worker pour le webhook sortant, mais ne remplace pas encore les connecteurs fournisseurs ni une file Redis/BullMQ. La récupération de mot de passe et le MFA ne sont pas implémentés ; seul le changement de mot de passe connecté existe.
- Le dépôt n’a ni configuration de déploiement applicatif (Dockerfile/proxy), ni instructions de sauvegarde/restauration, ni métriques/alertes. Redis est lancé par Compose mais n’est pas utilisé par le code ; les sessions sont en PostgreSQL.
- L’API n’expose pas de contrat OpenAPI. Les interfaces TypeScript du web sont maintenues séparément des DTO du serveur, ce qui contribue aux dérives observées.
- Les listes de tests montrent 11 fichiers de test au total, dont 4 e2e API et un test d’application web. Je n’ai pas trouvé de tests de workflow devis/approbation, ni de parcours browser complet, ni de seuil de couverture configuré.
- `pnpm-lock.yaml` et `package-lock.json` coexistent alors que le dépôt déclare pnpm comme gestionnaire. `apps/api/README.md` est encore le README générique NestJS.
- `git diff --check` signale des espaces finaux dans `apps/api/src/quotes/dto/quote.dto.ts` et `apps/web/src/api.ts`. La mise en forme de plusieurs fichiers modifiés est aussi irrégulière.
- `.env` est présent localement, ignoré par Git et non suivi ; je n’ai ni affiché ni inclus ses valeurs dans ce rapport.

## Points solides

- Identifiants UUID v7, migrations Prisma versionnées et contraintes relationnelles.
- Cookie de session `HttpOnly`, `Secure` par défaut, `SameSite=Strict`, jeton opaque aléatoire dont seul le hash SHA-256 est stocké.
- Argon2id, vérification factice pour un compte inconnu, réponse générique aux identifiants invalides, expiration idle et absolue des sessions.
- Validation globale `whitelist` + `forbidNonWhitelisted` et DTO validés côté serveur.
- RBAC clair avec scopes OWN/TEAM/ALL ; le filtrage des opportunités est implémenté dans le service.
- Journal d’audit append-only protégé contre UPDATE/DELETE/TRUNCATE en base.
- CI configurée pour lint, tests, migration de schéma, e2e et builds.
- `.env` correctement ignoré et `.env.example` séparé.

## Ordre conseillé de correction

1. Aligner le contrat Opportunités, corriger la compilation présumée et la forme de la réponse listée ; vérifier le formulaire numérique et ses DTO.
2. Appliquer les scopes aux lectures, mises à jour et soumissions des devis ; appliquer le périmètre lead à la recherche et aux doublons.
3. Corriger l’amorçage ADMIN documenté.
4. Mettre en place limitation de débit et configuration web de production (CSRF/Origin, headers, reverse proxy/TLS).
5. Corriger les transferts de relations lors des fusions et rendre audit/rôles atomiques ; minimiser les données conservées dans l’audit.
6. Ajouter pagination, limites et tests ciblés de permissions, approbation et fusion.
7. Mettre à jour le plan de livraison pour les lots 2 à 5 et les exigences d’exploitation.

## Méthode et limites

Les builds API (`pnpm --filter api build`) et web (`pnpm --filter web build`) ont réussi après les changements décrits ; la migration Prisma a été appliquée et `/api/health` confirme la connexion à la base. Aucune suite de tests ni scan CVE en ligne n’a été exécuté. La limitation IP est stockée en mémoire par processus ; un déploiement multi-instance doit aussi la configurer au niveau d’une passerelle avec stockage partagé. Les seuils SLA, la conservation des journaux et les règles métier des devis nécessitent une décision produit avant automatisation.

