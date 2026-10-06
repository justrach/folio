"""Offline migration acceptance tests. Runs only against a disposable local Unix-socket PostgreSQL cluster."""
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts/migrate-d1-to-postgres.py'
PG_BIN = Path('/opt/homebrew/opt/postgresql@14/bin')


class OfflineImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not all((PG_BIN / name).exists() for name in ('initdb','pg_ctl','createdb')) or not shutil.which('psql'):
            raise unittest.SkipTest('local throwaway PostgreSQL tools unavailable')
        cls.tmp = tempfile.TemporaryDirectory(prefix='folio-pg-test-')
        cls.path = Path(cls.tmp.name)
        cls.port = 54000 + (os.getpid() % 8000)
        cls.env = {**os.environ, 'PATH': str(PG_BIN)+os.pathsep+os.environ.get('PATH','')}
        subprocess.run([str(PG_BIN/'initdb'),'-D',str(cls.path/'data'),'-A','trust','--no-instructions'],
                       check=True, stdout=subprocess.DEVNULL)
        subprocess.run([str(PG_BIN/'pg_ctl'),'-D',str(cls.path/'data'),'-o',
                        f"-k {cls.path} -p {cls.port} -c listen_addresses=''",'-l',str(cls.path/'log'),'start'],
                       check=True,stdout=subprocess.DEVNULL)

    @classmethod
    def tearDownClass(cls):
        subprocess.run([str(PG_BIN/'pg_ctl'),'-D',str(cls.path/'data'),'stop','-m','immediate'],
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        cls.tmp.cleanup()

    def pg(self, database, sql):
        return subprocess.run(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-h',str(self.path),
                               '-p',str(self.port),'-d',database,'-c',sql],env=self.env,
                              text=True,capture_output=True,check=True).stdout.strip()

    def createdb(self, name):
        subprocess.run([str(PG_BIN/'createdb'),'-h',str(self.path),'-p',str(self.port),name],
                       check=True,stdout=subprocess.DEVNULL)

    def fixture(self):
        db = sqlite3.connect(':memory:')
        for migration in sorted((ROOT/'migrations').glob('[0-9][0-9][0-9][0-9]_*.sql')):
            db.executescript(migration.read_text())
        db.execute('CREATE TABLE published_question_snapshots (id TEXT PRIMARY KEY, summary_json TEXT NOT NULL CHECK(json_valid(summary_json)), imported_at TEXT NOT NULL, source TEXT NOT NULL)')
        db.execute('INSERT INTO published_question_snapshots VALUES (?,?,?,?)',
                   ('public-cohort','{"completedAt":"2026-09-27T00:00:00Z"}','2026-09-27T00:00:00Z','fixture'))
        db.execute('INSERT INTO "user" (id,name,email,email_verified,image,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
                   ('owner','a\n\\.\n\tπ, "test"','owner@example.test',1,'',1700000000123,1700000000123))
        db.execute('INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES (?,?,?,?,?,?)',
                   ('site','owner','https://example.test',r'\N',1700000000123,1))
        db.execute('INSERT INTO typesafe_reviews(id,user_id,run_id,source_revision,created_at,updated_at,status,model) VALUES (?,?,?,?,?,?,?,?)',
                   ('review','owner','deleted-run',0,1,1,'pending','model'))
        db.execute('INSERT INTO provider_cost_observations(user_id,source,source_id,source_revision,provider,status,source_created_at,observed_at,reported_complete) VALUES (?,?,?,?,?,?,?,?,?)',
                   ('owner','keyword','historic',0,'openai','completed',1,1,1))
        db.execute('INSERT INTO provider_cost_observations(user_id,source,source_id,source_revision,provider,status,source_created_at,observed_at,reported_complete) VALUES (?,?,?,?,?,?,?,?,?)',
                   ('owner','keyword','temporary',0,'openai','completed',1,1,0))
        db.execute("DELETE FROM provider_cost_observations WHERE source_id='temporary'")
        db.execute("INSERT INTO d1_migrations(id,name,applied_at) VALUES (21,'0021_keyword_research.sql','2026-09-27 00:00:00')") if 'd1_migrations' in [x[0] for x in db.execute('SELECT name FROM sqlite_master')] else None
        dump = self.path/'fixture.sql'
        with dump.open('w') as f:
            for line in db.iterdump(): f.write(line+'\n')
        db.close()
        return dump

    def import_dump(self, name, dump):
        return subprocess.run([sys.executable,str(SCRIPT),'--export',str(dump),'--socket',str(self.path),
                               '--port',str(self.port),'--database',name,'--apply'],
                              text=True,capture_output=True,env=self.env)

    def test_full_import_verification_and_refusal(self):
        dump = self.fixture()
        self.createdb('folio_fixture')
        result = self.import_dump('folio_fixture',dump)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.pg('folio_fixture','SELECT name FROM "user"'), 'a\n\\.\n\tπ, "test"')
        self.assertEqual(self.pg('folio_fixture','SELECT email_verified::int FROM "user"'),'1')
        self.assertEqual(self.pg('folio_fixture',"SELECT length(image) FROM \"user\""),'0')
        self.assertEqual(self.pg('folio_fixture','SELECT is_public FROM sites'),'1')
        self.assertEqual(self.pg('folio_fixture','SELECT count(*) FROM published_question_snapshots'),'1')
        self.assertEqual(self.pg('folio_fixture','SELECT count(*) FROM provider_cost_latest'),'2')
        self.assertEqual(self.pg('folio_fixture','SELECT max(id) FROM provider_cost_observations'),'1')
        self.assertEqual(self.pg('folio_fixture',"SELECT nextval(pg_get_serial_sequence('provider_cost_observations','id'))"),'3')
        self.assertEqual(self.pg('folio_fixture',"SELECT json_extract('{\"events\":[{\"id\":\"x\"}]}','$.events')"), '[{"id": "x"}]')
        self.assertEqual(self.pg('folio_fixture',"SELECT value FROM json_each('[\"seo\"]')"),'seo')
        self.assertEqual(self.pg('folio_fixture',"SELECT strftime('%Y-%m-%dT%H:%M:%fZ',1700000000.123,'unixepoch')"),'2023-11-14T22:13:20.123Z')
        self.pg('folio_fixture',"INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES ('seo','owner','example.test',10,11,'{\"status\":\"completed\",\"totalCostUsd\":0.5,\"costIsComplete\":true}')")
        self.assertEqual(self.pg('folio_fixture',"SELECT reported_known_micros||','||reported_complete FROM provider_cost_latest WHERE source='seo'"),'500000,1')
        self.assertEqual(self.pg('folio_fixture',"SELECT count(*) FROM provider_cost_latest WHERE source='semantic-review' AND id=1"),'1')
        denied = subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-h',str(self.path),'-p',str(self.port),'-d','folio_fixture','-c',
                                 "UPDATE provider_cost_observations SET reported_complete=0 WHERE id=1"],
                                env=self.env,text=True,capture_output=True)
        self.assertNotEqual(denied.returncode,0)
        self.pg('folio_fixture',"INSERT INTO evaluation_runs(id,user_id,target_url,suite_version,mode,status,created_at,updated_at,result_json) VALUES ('deleted-run','owner','https://example.test','v1','demo','completed',1,1,'{}')")
        self.pg('folio_fixture',"INSERT INTO agent_tool_calls(run_id,user_id,session_id,turn_id,call_id,tool_name,state,created_at,updated_at) VALUES ('deleted-run','owner','session','turn','call','read_saved_seo_report','reserved',1,1)")
        self.pg('folio_fixture',"UPDATE typesafe_reviews SET result_json='{}' WHERE id='review'")
        self.pg('folio_fixture',"UPDATE evaluation_runs SET deleted_at=2 WHERE id='deleted-run'")
        self.assertEqual(self.pg('folio_fixture',"SELECT count(*) FROM agent_tool_calls WHERE run_id='deleted-run'"),'0')
        self.assertEqual(self.pg('folio_fixture',"SELECT result_json IS NULL FROM typesafe_reviews WHERE id='review'"),'t')
        again = self.import_dump('folio_fixture',dump)
        self.assertNotEqual(again.returncode,0)
        self.assertIn('not empty',again.stderr)
        self.assertNotIn('owner@example.test',again.stderr)
        self.assertEqual(self.pg('folio_fixture','SELECT count(*) FROM "user"'),'1')

    def test_postgresql_rejection_rolls_back_entire_schema(self):
        dump = self.fixture()
        # SQLite accepts char(0) in TEXT; PostgreSQL rejects the resulting COPY value.
        dump.write_text(dump.read_text().replace('COMMIT;', "UPDATE \"user\" SET name=char(0) WHERE id='owner';\nCOMMIT;"))
        self.createdb('folio_rollback')
        result = self.import_dump('folio_rollback',dump)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('bad',result.stderr)
        self.assertEqual(self.pg('folio_rollback',"SELECT count(*) FROM pg_tables WHERE schemaname='public'"),'0')

    def test_unknown_table_refuses_without_schema(self):
        dump = self.fixture()
        dump.write_text(dump.read_text().replace('COMMIT;', "CREATE TABLE surprise(value TEXT);\nINSERT INTO surprise VALUES ('secret');\nCOMMIT;"))
        self.createdb('folio_reject')
        result = self.import_dump('folio_reject',dump)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Unknown D1 tables',result.stderr)
        self.assertNotIn('secret',result.stderr)
        self.assertEqual(self.pg('folio_reject',"SELECT count(*) FROM pg_tables WHERE schemaname='public'"),'0')


if __name__ == '__main__': unittest.main()
