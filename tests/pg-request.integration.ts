import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getPgPool, postgresDatabase } from "../src/lib/db";
import { withDatabaseRequest } from "../src/lib/pg/request-scope";
import { createPostgresDatabase, type PgExecutor } from "../src/lib/pg/database";
import { readSharedKeywordObservations } from "../src/lib/public-keyword-store";
import { authSchema } from "../src/lib/auth-schema-pg";
import type { D1Database } from "@cloudflare/workers-types";

const connection = process.env.FOLIO_PG_TEST_URL;
test("real PostgreSQL survives sequential/concurrent request scopes, auth, public reads and failed transactions", {skip: !connection, timeout:60_000}, async () => {
  const url = new URL(connection!);
  assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.port,"54679");
  const admin = new Pool({connectionString:connection, max:1});
  try {
    await admin.query(`CREATE TABLE public_keyword_observations (run_id text PRIMARY KEY, payload_json text, updated_at text NOT NULL)`);
    const ids = new Set<number>();
    const read = () => withDatabaseRequest(async () => {
      const pool = getPgPool(connection!,true);
      assert.equal(getPgPool(connection!,true),pool);
      const result=await pool.query("SELECT pg_backend_pid() AS pid");ids.add(result.rows[0].pid);
      const executor:PgExecutor={async query<T>(sql:string,values:unknown[]){const result=await pool.query(sql,values);return {rows:result.rows as T[],rowCount:result.rowCount};}};
      const db=createPostgresDatabase(executor) as unknown as D1Database;
      assert.deepEqual(await readSharedKeywordObservations(db),[]);
    });
    for(let n=0;n<25;n++) await read();
    await Promise.all(Array.from({length:15},read));
    assert.ok(ids.size>1,"Requests must not reuse a cross-request socket");
    await admin.query(`CREATE TABLE "user" (id text PRIMARY KEY,name text NOT NULL,email text UNIQUE NOT NULL,email_verified boolean NOT NULL DEFAULT false,image text,created_at bigint NOT NULL,updated_at bigint NOT NULL);
      CREATE TABLE session (id text PRIMARY KEY,expires_at bigint NOT NULL,token text UNIQUE NOT NULL,created_at bigint NOT NULL,updated_at bigint NOT NULL,ip_address text,user_agent text,user_id text REFERENCES "user"(id) ON DELETE CASCADE NOT NULL);
      CREATE TABLE account (id text PRIMARY KEY,account_id text NOT NULL,provider_id text NOT NULL,user_id text REFERENCES "user"(id) ON DELETE CASCADE NOT NULL,access_token text,refresh_token text,id_token text,access_token_expires_at bigint,refresh_token_expires_at bigint,scope text,password text,created_at bigint NOT NULL,updated_at bigint NOT NULL);
      CREATE TABLE verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,expires_at bigint NOT NULL,created_at bigint,updated_at bigint);
      CREATE TABLE rate_limit (id text PRIMARY KEY,key text UNIQUE NOT NULL,count bigint NOT NULL,last_request bigint NOT NULL);`);
    const auth=()=>betterAuth({baseURL:"http://localhost:3001",secret:"local-fixture-auth-secret-at-least-32-chars",database:drizzleAdapter(drizzle(getPgPool(connection!,true),{schema:authSchema}),{provider:"pg",schema:authSchema}),emailAndPassword:{enabled:true,minPasswordLength:10}});
    await withDatabaseRequest(async()=>{const result=await auth().api.signUpEmail({body:{name:"Fixture",email:"fixture@example.test",password:"fixture-password-long"}});assert.ok(result.user.id);});
    const signed=await withDatabaseRequest(()=>auth().api.signInEmail({body:{email:"fixture@example.test",password:"fixture-password-long"},returnHeaders:true}));
    const cookies=signed.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ');
    for(let n=0;n<10;n++) await withDatabaseRequest(async()=>{const session=await auth().api.getSession({headers:new Headers({cookie:cookies})});assert.equal(session?.user.email,"fixture@example.test");});
    await withDatabaseRequest(async()=>{const pool=getPgPool(connection!,true);const client=await pool.connect();try{await client.query("BEGIN");await client.query("INSERT INTO public_keyword_observations VALUES ('rolled-back',NULL,'2026-11-08')");await client.query("ROLLBACK");}finally{client.release();}});
    await withDatabaseRequest(async()=>{
      const db=postgresDatabase(getPgPool(connection!,true));
      await assert.rejects(db.batch([
        db.prepare("INSERT INTO public_keyword_observations VALUES (?,NULL,?)").bind("duplicate","2026-11-08"),
        db.prepare("INSERT INTO public_keyword_observations VALUES (?,NULL,?)").bind("duplicate","2026-11-08"),
      ]));
    });
    const result=await admin.query("SELECT COUNT(*)::integer AS count FROM public_keyword_observations");assert.equal(result.rows[0].count,0);
  } finally {await admin.end();}
});
