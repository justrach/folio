-- One explicitly authorized semantic review per saved live evaluation.
-- Reservation survives timeouts; ambiguous requests are never automatically retried.
CREATE TABLE typesafe_reviews (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 run_id TEXT NOT NULL,
 source_revision INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','completed','needs_attention')),
 model TEXT NOT NULL,
 input_tokens INTEGER,
 output_tokens INTEGER,
 latency_ms INTEGER,
 result_json TEXT,
 UNIQUE(user_id,run_id)
);
CREATE INDEX typesafe_review_quota ON typesafe_reviews(user_id,created_at);
CREATE TRIGGER typesafe_delete_evidence AFTER UPDATE OF deleted_at ON evaluation_runs
WHEN NEW.deleted_at IS NOT NULL
BEGIN
 UPDATE typesafe_reviews SET result_json=NULL WHERE user_id=NEW.user_id AND run_id=NEW.id;
END;
CREATE TRIGGER typesafe_delete_source AFTER DELETE ON evaluation_runs
BEGIN
 UPDATE typesafe_reviews SET result_json=NULL WHERE user_id=OLD.user_id AND run_id=OLD.id;
END;
-- Review usage remains after evidence deletion, with money explicitly unknown.
DROP VIEW provider_cost_latest;
CREATE VIEW provider_cost_latest AS
 SELECT o.* FROM provider_cost_observations o
 WHERE o.id=(SELECT MAX(n.id) FROM provider_cost_observations n
 WHERE n.user_id=o.user_id AND n.source=o.source AND n.source_id=o.source_id)
 UNION ALL
 SELECT rowid,user_id,'semantic-review',id,source_revision,'typesafe',model,status,
 created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL
 FROM typesafe_reviews;
