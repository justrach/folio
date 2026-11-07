/** SQLite → Postgres translation for the D1-shaped adapter.
 *
 * This is deliberately small and explicit: it translates the constructs the
 * codebase actually uses and throws on any it does not know, so a ported store
 * fails in a test instead of silently running the wrong query.
 */

const SQLITE_LEFTOVERS = /(\bjson_each\s*\(|\bjson_extract\s*\(|\bstrftime\s*\(|\bprintf\s*\(|\bgroup_concat\s*\(|\biif\s*\(|\bGLOB\b|AUTOINCREMENT|INSERT\s+OR\s+(IGNORE|REPLACE))/i;

/** Split on top-level commas only (ignores commas inside parens/quotes). */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of input) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Replace every call of `name(...)` with the result of `fn(args)`. */
function rewriteCalls(sql: string, name: string, fn: (args: string[]) => string): string {
  let out = "";
  let index = 0;
  const needle = `${name.toLowerCase()}(`;
  while (index < sql.length) {
    const found = sql.toLowerCase().indexOf(needle, index);
    if (found === -1) {
      out += sql.slice(index);
      break;
    }
    out += sql.slice(index, found);
    let cursor = found + needle.length;
    let depth = 1;
    let quote: string | null = null;
    let body = "";
    while (cursor < sql.length && depth > 0) {
      const char = sql[cursor];
      if (quote) {
        if (char === quote) quote = null;
        body += char;
      } else if (char === "'" || char === '"') {
        quote = char;
        body += char;
      } else if (char === "(") {
        depth += 1;
        body += char;
      } else if (char === ")") {
        depth -= 1;
        if (depth > 0) body += char;
      } else {
        body += char;
      }
      cursor += 1;
    }
    out += fn(splitTopLevel(body));
    index = cursor;
  }
  return out;
}

function jsonPath(literal: string): string | null {
  const cleaned = literal.trim().replace(/^'/, "").replace(/'$/, "");
  if (!cleaned.startsWith("$")) return null;
  const segments = cleaned.replace(/^\$\.?/, "").split(".").filter(Boolean);
  return segments.length ? `{${segments.join(",")}}` : "{}";
}

/** SQLite ? placeholders → $1..$n, skipping quoted strings. */
export function toPositional(sql: string): string {
  let out = "";
  let quote: string | null = null;
  let position = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      out += char;
      if (char === quote) {
        if (sql[index + 1] === quote) {
          out += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      continue;
    }
    if (char === "?") {
      position += 1;
      out += `$${position}`;
      continue;
    }
    out += char;
  }
  return out;
}

export function translateJson(sql: string): string {
  const extracted = rewriteCalls(sql, "json_extract", args => {
    if (args.length !== 2) throw new Error(`json_extract expects 2 arguments, saw ${args.length}`);
    const path = jsonPath(args[1]);
    if (path === null) throw new Error(`Unsupported json_extract path: ${args[1]}`);
    const expression = args[0];
    return path === "{}" ? `(${expression}::jsonb)::text` : `(${expression}::jsonb #>> '${path}')`;
  });
  // SQLite's json_object/json_group_array return TEXT; the Postgres builders
  // return jsonb, which node-postgres hands back already parsed. Cast to text so
  // callers keep their JSON.parse contract.
  const built = rewriteCalls(extracted, "json_object", args => {
    if (args.length % 2 !== 0) throw new Error(`json_object expects key/value pairs, saw ${args.length}`);
    // json_extract reads as text so it can be compared with string literals, but
    // json_object must embed the JSON value itself: numbers stay numbers and
    // nested objects stay objects, matching SQLite's typed json_extract.
    const values = args.map((argument, index) =>
      index % 2 === 1 && /^\(.*::jsonb #>> '.*'\)$/.test(argument.trim())
        ? argument.trim().replace(/#>>/, "#>")
        : argument,
    );
    return `(jsonb_build_object(${values.join(", ")})::text)`;
  });
  const aggregated = rewriteCalls(built, "json_group_array", args => {
    if (args.length !== 1) throw new Error(`json_group_array expects 1 argument, saw ${args.length}`);
    return `(jsonb_agg(${args[0]})::text)`;
  });
  return rewriteCalls(aggregated, "json_each", args => {
    if (args.length === 1) {
      // SQLite iterates a JSON array of scalars with one argument. The text
      // variant keeps `value` comparable to a plain string.
      return `jsonb_array_elements_text((${args[0]})::jsonb)`;
    }
    if (args.length !== 2) throw new Error(`json_each expects 1 or 2 arguments, saw ${args.length}`);
    const path = jsonPath(args[1]);
    if (path === null || path === "{}") throw new Error(`Unsupported json_each path: ${args[1]}`);
    const pointer = path.replace(/^\{(.*)\}$/, "$1").split(",");
    return `jsonb_array_elements((${args[0]}::jsonb #> '{${pointer.join(",")}}'))`;
  });
}

export function translateDates(sql: string): string {
  return rewriteCalls(sql, "strftime", args => {
    if (args.length !== 3 || !/unixepoch/i.test(args[2]))
      throw new Error(`Unsupported strftime call: ${args.join(", ")}`);
    // SQLite's 'unixepoch' modifier reads the value as seconds, which is what
    // the call sites already compute (created_at / 1000.0).
    const expression = args[1];
    return `to_char(to_timestamp(${expression}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  });
}

/** Two-argument MAX/MIN become GREATEST/LEAST; the aggregate forms are left alone. */
export function translateComparisons(sql: string): string {
  const rewrite = (input: string) =>
    rewriteCalls(rewriteCalls(input, "MAX", args => (args.length === 2 ? `GREATEST(${args.join(", ")})` : `MAX(${args.join(", ")})`)), "MIN", args =>
      args.length === 2 ? `LEAST(${args.join(", ")})` : `MIN(${args.join(", ")})`,
    );
  return rewrite(sql);
}

export function translateInserts(sql: string): string {
  if (!/^\s*INSERT\s+OR\s+IGNORE/i.test(sql)) {
    if (/INSERT\s+OR\s+REPLACE/i.test(sql)) throw new Error("INSERT OR REPLACE is not supported by the translator");
    return sql;
  }
  let out = sql.replace(/^\s*INSERT\s+OR\s+IGNORE/i, "INSERT");
  if (!/ON\s+CONFLICT/i.test(out)) {
    const returning = out.search(/\bRETURNING\b/i);
    out = returning === -1
      ? `${out.trimEnd()} ON CONFLICT DO NOTHING`
      : `${out.slice(0, returning).trimEnd()} ON CONFLICT DO NOTHING ${out.slice(returning)}`;
  }
  return out;
}


/** `user` is reserved in Postgres; SQLite accepted it unquoted. Quote the bare
 * identifier (never `user_id`, `current_user`, or anything inside quotes). */
export function quoteReserved(sql: string): string {
  let out = "";
  let quote: string | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      out += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      continue;
    }
    if (sql.slice(index, index + 4).toLowerCase() === "user" &&
        !/[A-Za-z0-9_]/.test(sql[index - 1] ?? "") &&
        !/[A-Za-z0-9_]/.test(sql[index + 4] ?? "")) {
      out += '"user"';
      index += 3;
      continue;
    }
    out += char;
  }
  return out;
}

/** Full translation. Throws if a SQLite-only construct survives. */
/**
 * Postgres resolves bare column names in `ON CONFLICT ... DO UPDATE` against
 * both the target relation and the insert's source, so an upsert that SQLite
 * accepts ("count = count + 1") fails there as ambiguous. The target columns
 * are named in the INSERT, so qualify exactly those.
 */
export function qualifyUpsert(sql: string): string {
  const head = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+("?\w+"?)\s*\(([^)]*)\)/i.exec(sql);
  if (!head) return sql;
  const table = head[1];
  const columns = head[2]
    .split(",")
    .map(column => column.trim().replace(/"/g, ""))
    .filter(Boolean);
  if (columns.length === 0) return sql;
  const marker = /\bDO\s+UPDATE\s+SET\b/i.exec(sql);
  if (!marker) return sql;
  const start = marker.index + marker[0].length;
  const returning = /\bRETURNING\b/i.exec(sql.slice(start));
  const end = returning ? start + returning.index : sql.length;
  const qualify = (text: string) =>
    text
      .split(/('(?:[^']|'')*')/)
      .map((segment, index) =>
        index % 2 === 1
          ? segment
          : columns.reduce(
              (inner, column) =>
                inner.replace(
                  new RegExp(`(?<![\\w.$"])${column}(?![\\w$"])`, "g"),
                  `${table}.${column}`,
                ),
              segment,
            ),
      )
      .join("");
  // Postgres rejects a qualified assignment target, so only the value side of
  // each `column = expression` pair is rewritten.
  const clause = sql
    .slice(start, end)
    .split(/((?:^|,)\s*[\w"]+\s*=(?!=))/);
  const qualified = clause
    .map((piece, index) => (index % 2 === 1 ? piece : qualify(piece)))
    .join("");
  return sql.slice(0, start) + qualified + sql.slice(end);
}

/**
 * Postgres cannot infer a type for a placeholder used only as `? IS NULL`, and
 * SQLite happily accepts it. Give those parameters an explicit text type.
 */
export function castNullChecks(sql: string): string {
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((segment, index) =>
      index % 2 === 1 ? segment : segment.replace(/\?(?=\s+IS\s+(?:NOT\s+)?NULL\b)/gi, "CAST(? AS TEXT)"),
    )
    .join("");
}

/** SQLite's ternary `iif(condition, a, b)` is a CASE expression in Postgres. */
export function translateTernary(sql: string): string {
  return rewriteCalls(sql, "iif", args => {
    if (args.length === 2) return `(CASE WHEN ${args[0]} THEN ${args[1]} ELSE NULL END)`;
    if (args.length !== 3) throw new Error(`iif expects 2 or 3 arguments, saw ${args.length}`);
    return `(CASE WHEN ${args[0]} THEN ${args[1]} ELSE ${args[2]} END)`;
  });
}

/**
 * Postgres folds unquoted identifiers to lower case, so `AS updatedAt` comes back
 * as `updatedat` while SQLite returns it unchanged. Quoting mixed-case aliases
 * keeps the column name the store expects on both engines.
 */
export function quoteAliases(sql: string): string {
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : segment.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, (match, alias: string) =>
            // Types and keywords are upper case; a mixed-case name is an alias.
            /[a-z]/.test(alias) && /[A-Z]/.test(alias) ? `AS "${alias}"` : match,
          ),
    )
    .join("");
}

export function toPostgres(sql: string): string {
  let out = sql;
  out = translateInserts(out);
  out = translateJson(out);
  out = translateDates(out);
  out = translateComparisons(out);
  out = translateTernary(out);
  out = quoteReserved(out);
  out = qualifyUpsert(out);
  out = quoteAliases(out);
  out = castNullChecks(out);
  out = toPositional(out);
  const leftover = SQLITE_LEFTOVERS.exec(out);
  if (leftover) throw new Error(`Unsupported SQLite construct in Postgres query: ${leftover[0]}`);
  return out;
}
