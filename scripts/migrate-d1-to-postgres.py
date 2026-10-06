#!/usr/bin/env python3
"""D1 SQL dump -> NEW empty PostgreSQL database. Python stdlib + psql.

Local: --export PRIVATE.sql --socket /tmp/pg-socket --port 5432 --database empty_db --apply
Remote rehearsal: --export PRIVATE.sql --remote-url-file PRIVATE_URL --apply
Remote mode rolls back after full-row verification unless --commit-remote is also set.
No implicit credentials or destructive reset.
"""
import argparse
import os
from pathlib import Path
import re
import sqlite3
import struct
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / 'migrations/postgres/0001_schema.sql'
ROWIDS = {'typesafe_reviews', 'website_crawl_reviews', 'keyword_research_requests'}
# Wrangler bookkeeping, when present in the SQL export, is retained too.
BOOKKEEPING = 'd1_migrations'
# Production's public-index cohort table predates the numbered D1 migrations.
LEGACY_TABLES = {'published_question_snapshots': ['id','summary_json','imported_at','source']}


def quote(name):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', name):
        raise ValueError('Unsupported SQL identifier in export')
    return '"' + name + '"'


def clean_environment():
    # Ignore PGHOST/PGSERVICE/PGPASSWORD/PGPASSFILE and user connection defaults.
    return {**{k: v for k, v in os.environ.items() if not k.startswith('PG')},
            'PGPASSFILE': '/dev/null', 'PGSERVICEFILE': '/dev/null', 'PGOPTIONS': '-c search_path=public'}


def command(args, sql, env):
    proc = subprocess.run(args, input=sql, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, env=env)
    if proc.returncode: raise RuntimeError('Local PostgreSQL preflight failed (details suppressed)')
    return proc.stdout


def load_sqlite(path, db):
    if hasattr(db, 'enable_load_extension'): db.enable_load_extension(False)
    # Execute one complete statement at a time; do not echo export contents or SQLite exceptions.
    pending = ''
    with path.open('r', encoding='utf-8') as source:
        for line in source:
            pending += line
            if sqlite3.complete_statement(pending):
                if pending.strip(): db.execute(pending)
                pending = ''
    if pending.strip(): raise ValueError('Incomplete D1 export')
    db.commit()
    problems = db.execute('PRAGMA integrity_check').fetchone()[0]
    if problems != 'ok': raise ValueError('D1 export failed integrity check')
    db.execute('PRAGMA foreign_keys=ON')
    if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('D1 export has broken foreign keys')


def source_tables(db):
    return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def columns(db, table):
    return [r[1] for r in db.execute('PRAGMA table_info(' + quote(table) + ')')]


def copy_field(value):
    if value is None: return r'\N'
    return str(value).replace('\\', '\\\\').replace('\t', r'\t').replace('\n', r'\n').replace('\r', r'\r')


def encode(value, kind):
    if value is None: return '-'
    if kind == 'REAL': return struct.pack('!d', value).hex()
    if kind in ('INTEGER','TIMESTAMP'): return str(value).encode().hex()
    if not isinstance(value, str): raise ValueError('Unsupported D1 column storage class')
    return value.encode('utf-8').hex()


def stream_import(db, tables, psql, schema, env, commit):
    proc = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, env=env, bufsize=1024 * 1024)
    assert proc.stdin and proc.stdout
    try:
        def send(text): proc.stdin.write(text.encode('utf-8'))
        send('BEGIN;\nSET LOCAL search_path=public;\nSET CONSTRAINTS ALL DEFERRED;\n')
        send("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')) THEN RAISE EXCEPTION 'Destination is not empty'; END IF; END $$;\n")
        # Replay historical observations verbatim; the setting is transaction-local.
        send("SET LOCAL folio.importing = 'on';\n")
        send(schema + '\n')
        for table in tables:
            names = columns(db, table)
            if table in ROWIDS: names = ['d1_rowid'] + names
            qtable = quote(table)
            qcols = ','.join(map(quote, names))
            send(f'COPY {qtable} ({qcols}) FROM STDIN;\n')
            query = ('SELECT rowid,* FROM ' if table in ROWIDS else 'SELECT * FROM ') + qtable
            for row in db.execute(query):
                if table == 'user':
                    row = list(row)
                    if row[names.index('email_verified')] not in (0,1):
                        raise ValueError('Unsupported D1 boolean value')
                    row[names.index('email_verified')] = 't' if row[names.index('email_verified')] == 1 else 'f'
                send('\t'.join(map(copy_field,row))+'\n')
            send('\\.\n')
        # Restore sequences above imported explicit keys before verification/commit.
        for table, column in [('provider_cost_observations','id'), ('typesafe_tool_calls','id'),
                              *[(t,'d1_rowid') for t in sorted(ROWIDS)], (BOOKKEEPING,'id')]:
            seq = db.execute("SELECT seq FROM sqlite_sequence WHERE name=?",(table,)).fetchone()
            floor = int(seq[0]) if seq else 0
            if floor < 0 or floor > 9223372036854775807: raise ValueError('Unsupported SQLite sequence')
            send(f"DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('{table}','{column}'), "
                 f"GREATEST(COALESCE((SELECT max({quote(column)}) FROM {quote(table)}),0),{floor},1), "
                 f"EXISTS (SELECT 1 FROM {quote(table)}) OR {floor}>0); END $$;\n")
        # Query every stored column as hex bytes (IEEE754 for REAL) while transaction is open.
        # This tests all private payloads, IDs, rowids, flags and epoch integers without printing them.
        for table in tables:
            names = columns(db, table)
            if table in ROWIDS: names = ['d1_rowid'] + names
            kinds = {r[1]: r[2].upper() for r in db.execute('PRAGMA table_info(' + quote(table) + ')')}
            if table in ROWIDS: kinds['d1_rowid'] = 'INTEGER'
            expr = [f"CASE WHEN {quote(n)} IS NULL THEN '-' ELSE " +
                    (f"encode(float8send({quote(n)}),'hex')" if kinds[n] == 'REAL' else
                     (f"encode(convert_to(CASE WHEN {quote(n)} THEN '1' ELSE '0' END,'UTF8'),'hex')" if table=='user' and n=='email_verified' else
                      f"encode(convert_to({quote(n)}::text,'UTF8'),'hex')")) + ' END'
                    for n in names]
            # Composite keys retain deterministic order through a complete column ordering.
            ordering = ','.join(quote(n) + (' COLLATE "C"' if kinds[n] == 'TEXT' else '') for n in names)
            # Hex fields contain only [0-9a-f-], so text mode preserves empty strings
            # without CSV's special quoting of an empty non-NULL field.
            send(f"COPY (SELECT {','.join(expr)} FROM {quote(table)} ORDER BY {ordering}) TO STDOUT WITH (FORMAT text, DELIMITER ',');\n")
            send(f"SELECT 'FOLIO_END_{table}';\n")
        proc.stdin.flush()
        # psql's -q suppresses command tags; -A -t leaves only COPY rows and sentinels.
        for table in tables:
            names = columns(db, table)
            if table in ROWIDS: names = ['d1_rowid'] + names
            kinds = {r[1]: r[2].upper() for r in db.execute('PRAGMA table_info(' + quote(table) + ')')}
            if table in ROWIDS: kinds['d1_rowid'] = 'INTEGER'
            ordering = ','.join(quote(n) + (' COLLATE BINARY' if kinds[n] == 'TEXT' else '') for n in names)
            for row in db.execute(('SELECT rowid,* FROM ' if table in ROWIDS else 'SELECT * FROM ') +
                                  quote(table) + ' ORDER BY ' + ordering):
                got = proc.stdout.readline().decode('utf-8').rstrip('\n')
                expected = ','.join(encode(v,kinds[n]) for n,v in zip(names,row))
                if got != expected:
                    actual_fields, expected_fields = got.split(','), expected.split(',')
                    changed = next(((name, len(actual), len(wanted), actual == '-', wanted == '-')
                                    for name, actual, wanted in zip(names, actual_fields, expected_fields)
                                    if actual != wanted), ('row framing or count', 0, 0, False, False))
                    raise ValueError('Full-row verification failed for ' + table + ' column ' + changed[0]
                                     + f' (encoded lengths {changed[1]}/{changed[2]}, null {changed[3]}/{changed[4]})')
            marker = proc.stdout.readline().decode('utf-8').strip()
            if marker != 'FOLIO_END_' + table: raise ValueError('Row count mismatch for ' + table)
        send('COMMIT;\n' if commit else 'ROLLBACK;\n')
        proc.stdin.close()
        if proc.wait() != 0: raise RuntimeError('Import rolled back (SQL error details suppressed)')
    except Exception:
        proc.kill()
        proc.wait()
        raise


def remote_connection(path):
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError('Remote URL file must exist and have owner-only permissions')
    url = urlsplit(path.read_text().strip())
    options = parse_qs(url.query, strict_parsing=True)
    if (url.scheme not in ('postgres','postgresql') or not url.hostname or not url.username or
            not url.password or not url.path.strip('/') or url.hostname in ('localhost','127.0.0.1') or
            options != {'sslmode':['verify-full'], 'sslrootcert':['system']}):
        raise ValueError('Unsupported remote URL or TLS options')
    database = unquote(url.path.lstrip('/'))
    # The remote name is passed as a psql argument, never interpolated into SQL;
    # managed providers may assign names starting with digits or use 'postgres'.
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,63}', database) or database in {'template0','template1'}:
        raise ValueError('Unsupported remote database name')
    env = clean_environment()
    env.update(PGPASSWORD=unquote(url.password), PGSSLMODE='verify-full', PGSSLROOTCERT='system')
    return ['-h',url.hostname,'-p',str(url.port or 5432),'-U',unquote(url.username),'-d',database], env


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--export', required=True, type=Path)
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument('--socket', type=Path, help='absolute LOCAL Unix socket directory')
    target.add_argument('--remote-url-file', type=Path, help='owner-only file containing an authorized remote URL')
    p.add_argument('--port', type=int)
    p.add_argument('--database')
    p.add_argument('--apply', action='store_true', help='explicit authorization for import into an EMPTY database')
    p.add_argument('--commit-remote', action='store_true', help='commit remote import after full-row verification')
    a = p.parse_args()
    if not a.apply: p.error('Missing --apply; no changes made')
    if not a.export.is_file(): p.error('Export file missing')
    if a.socket:
        if a.commit_remote or not a.port or not a.database: p.error('Local mode requires port/database and refuses --commit-remote')
        if not a.socket.is_absolute() or not a.socket.is_dir() or not (a.socket / f'.s.PGSQL.{a.port}').exists():
            p.error('Only an existing local PostgreSQL Unix socket is accepted')
        if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', a.database): p.error('Invalid database name')
        if a.database in {'postgres','template0','template1'}: p.error('Refusing maintenance databases')
        target_args, env = ['-h',str(a.socket),'-p',str(a.port),'-d',a.database], clean_environment()
    else:
        if a.port or a.database: p.error('Remote mode reads host, port, and database only from the private URL file')
        target_args, env = remote_connection(a.remote_url_file)
    args = ['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',*target_args]
    # Managed providers may keep internal relations outside pg_catalog. Only public
    # receives Folio tables in remote mode; the transaction rechecks that schema.
    scope = "n.nspname='public'" if a.remote_url_file else "n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"
    preflight = f"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE {scope} AND c.relkind IN ('r','p','v','m','f','S');"
    if command(args, preflight, env).strip() != '0': raise ValueError('Destination is not empty; refusing import')
    with tempfile.TemporaryDirectory(prefix='folio-export-') as tmp:
        db = sqlite3.connect(str(Path(tmp)/'source.sqlite'))
        try:
            load_sqlite(a.export, db)
            expected = sqlite3.connect(':memory:')
            for file in sorted((ROOT/'migrations').glob('[0-9][0-9][0-9][0-9]_*.sql')):
                expected.executescript(file.read_text())
            actual = source_tables(db)
            tables = sorted(source_tables(expected) | {BOOKKEEPING} | (actual & set(LEGACY_TABLES)))
            if actual - set(tables): raise ValueError('Unknown D1 tables; refusing to omit records')
            if set(tables) - actual - {BOOKKEEPING}: raise ValueError('Missing application tables in export')
            for table in set(tables) - {BOOKKEEPING}:
                expected_columns = LEGACY_TABLES.get(table) or columns(expected,table)
                if columns(db,table) != expected_columns:
                    raise ValueError('D1 column layout differs from migrations for ' + table)
            if BOOKKEEPING in actual and columns(db,BOOKKEEPING) != ['id','name','applied_at']:
                raise ValueError('Unrecognized D1 migration bookkeeping columns')
            if BOOKKEEPING not in actual:
                db.execute('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)')
            stream_import(db, tables, args, SCHEMA.read_text(), env, a.socket is not None or a.commit_remote)
        finally: db.close()
    result = 'committed' if a.socket is not None or a.commit_remote else 'verified and rolled back'
    print(f'Import {result}; all table rows and values verified inside transaction (no row data printed).')


if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Only our fixed messages may leave this process; no SQL/credentials/private values.
        if isinstance(error, ValueError) and str(error).startswith(('Destination ', 'Unknown D1', 'Missing application',
             'D1 column', 'Unrecognized D1', 'Full-row', 'Row count', 'Unsupported', 'Remote URL', 'Incomplete D1', 'D1 export')):
            print(str(error), file=sys.stderr)
        else: print('Offline import failed; destination transaction rolled back (details suppressed).', file=sys.stderr)
        sys.exit(1)
