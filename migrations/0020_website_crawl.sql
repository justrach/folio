CREATE TABLE website_crawl_grants (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 run_id TEXT NOT NULL UNIQUE REFERENCES evaluation_runs(id), token_hash TEXT NOT NULL UNIQUE,
 target_url TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE website_crawl_pages (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES website_crawl_grants(id),
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, url TEXT NOT NULL,
 status TEXT NOT NULL, page_json TEXT, created_at INTEGER NOT NULL,
 UNIQUE(grant_id,url)
);
CREATE TABLE website_crawl_reviews (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE REFERENCES website_crawl_grants(id),
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, status TEXT NOT NULL,
 model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER,
 result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TRIGGER erase_website_crawl AFTER UPDATE OF deleted_at ON evaluation_runs WHEN NEW.deleted_at IS NOT NULL BEGIN
 DELETE FROM website_crawl_pages WHERE grant_id IN (SELECT id FROM website_crawl_grants WHERE run_id=NEW.id);
 UPDATE website_crawl_reviews SET result_json=NULL WHERE grant_id IN (SELECT id FROM website_crawl_grants WHERE run_id=NEW.id);
 UPDATE website_crawl_grants SET target_url='',expires_at=0 WHERE run_id=NEW.id;
END;
DROP VIEW provider_cost_latest;
CREATE VIEW provider_cost_latest AS
 SELECT o.* FROM provider_cost_observations o WHERE o.id=(SELECT MAX(n.id) FROM provider_cost_observations n WHERE n.user_id=o.user_id AND n.source=o.source AND n.source_id=o.source_id)
 UNION ALL SELECT rowid,user_id,'semantic-review',id,source_revision,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_reviews
 UNION ALL SELECT id,user_id,'agent-semantic-tool',CAST(id AS TEXT),0,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_tool_calls
 UNION ALL SELECT rowid,user_id,'crawl-semantic-review',id,0,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM website_crawl_reviews;
