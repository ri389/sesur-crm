-- Les événements d'audit conservent l'identifiant UUID de leur acteur comme
-- référence historique, sans empêcher la suppression définitive du compte.
ALTER TABLE "audit_log"
  DROP CONSTRAINT "audit_log_actor_user_id_fkey";
