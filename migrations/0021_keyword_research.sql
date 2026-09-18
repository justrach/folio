ALTER TABLE sandbox_seo_grants ADD COLUMN tool_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE keyword_research_requests (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 grant_id TEXT REFERENCES sandbox_seo_grants(id), domain TEXT NOT NULL,
 request_hash TEXT NOT NULL, request_key_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', result_json TEXT, cost_micros INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(user_id,request_key_hash), CHECK(cost_micros IS NULL OR cost_micros>=0)
);
CREATE INDEX keyword_research_owner_time ON keyword_research_requests(user_id,created_at);
CREATE INDEX keyword_research_grant ON keyword_research_requests(grant_id);
DROP VIEW provider_cost_latest;
CREATE VIEW provider_cost_latest AS
 SELECT o.* FROM provider_cost_observations o WHERE o.id=(SELECT MAX(n.id) FROM provider_cost_observations n WHERE n.user_id=o.user_id AND n.source=o.source AND n.source_id=o.source_id)
 UNION ALL SELECT rowid,user_id,'semantic-review',id,source_revision,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_reviews
 UNION ALL SELECT id,user_id,'agent-semantic-tool',CAST(id AS TEXT),0,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_tool_calls
 UNION ALL SELECT rowid,user_id,'crawl-semantic-review',id,0,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM website_crawl_reviews
 UNION ALL SELECT rowid,user_id,'keyword-research',id,0,'dataforseo',NULL,status,created_at,updated_at,NULL,NULL,NULL,NULL,cost_micros,CASE WHEN cost_micros IS NULL THEN 0 ELSE 1 END,NULL FROM keyword_research_requests;
