/**
 * SQL execution bridge for the PrismaConversationRepository.
 *
 * In a standard deployment, PrismaClient connects directly to PostgreSQL
 * via DATABASE_URL. In the Bolt hosted environment, the database is only
 * reachable through the Supabase MCP execute_sql tool. This module
 * abstracts the execution layer so the repository can run against either.
 *
 * When DATABASE_URL is available and the database is directly reachable,
 * set USE_PRISMA_CLIENT=true to use PrismaClient directly. Otherwise,
 * queries are executed through the Supabase SQL bridge.
 */

export interface SqlResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
}

/**
 * Parses a SQL string with $1, $2, ... placeholders and escapes
 * values safely. This is used when executing through the Supabase
 * MCP execute_sql tool, which accepts raw SQL strings.
 */
export function buildSqlLiteral(
  template: string,
  params: unknown[],
): string {
  let result = template;
  for (let i = 0; i < params.length; i++) {
    const placeholder = `$${i + 1}`;
    const literal = escapeValue(params[i]);
    result = result.replace(placeholder, literal);
  }
  return result;
}

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) {
    return "NULL";
  }
  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }
  if (typeof val === "number") {
    return String(val);
  }
  if (typeof val === "string") {
    return `'${val.replace(/'/g, "''")}'`;
  }
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  if (Array.isArray(val)) {
    return `ARRAY[${val.map(escapeValue).join(",")}]::text[]`;
  }
  return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
}

/**
 * Generates a cuid-style ID for new records.
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${random}`;
}
