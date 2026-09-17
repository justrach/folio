CREATE TABLE typesafe_tool_grants (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 run_id TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL
);
CREATE TABLE typesafe_tool_calls (
 id INTEGER PRIMARY KEY AUTOINCREMENT,grant_id TEXT NOT NULL REFERENCES typesafe_tool_grants(id),
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,request_key TEXT NOT NULL,input_hash TEXT NOT NULL,
 status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 model TEXT NOT NULL,input_tokens INTEGER,output_tokens INTEGER,latency_ms INTEGER,result_json TEXT,
 UNIQUE(grant_id,request_key)
);
CREATE INDEX typesafe_tool_daily ON typesafe_tool_calls(user_id,created_at);
DROP VIEW provider_cost_latest;
CREATE VIEW provider_cost_latest AS
 SELECT o.* FROM provider_cost_observations o WHERE o.id=(SELECT MAX(n.id) FROM provider_cost_observations n WHERE n.user_id=o.user_id AND n.source=o.source AND n.source_id=o.source_id)
 UNION ALL SELECT rowid,user_id,'semantic-review',id,source_revision,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_reviews
 UNION ALL SELECT id,user_id,'agent-semantic-tool',CAST(id AS TEXT),0,'typesafe',model,status,created_at,updated_at,input_tokens,NULL,output_tokens,NULL,NULL,0,NULL FROM typesafe_tool_calls;
