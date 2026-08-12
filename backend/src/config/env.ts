/**
 * Environment configuration for the backend.
 * All env access goes through this module.
 */
export interface EnvConfig {
  port: number;
  databaseUrl: string;
  aiProvider: string;
  perplexityApiKey?: string;
  useInMemoryDb: boolean;
}

export function loadEnv(): EnvConfig {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const aiProvider = process.env.AI_PROVIDER ?? "mock";
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const port = parseInt(process.env.PORT ?? "3001", 10);
  // When no DATABASE_URL is set, we use in-memory repositories.
  // This lets the app run for development/testing without a Postgres instance.
  const useInMemoryDb = !databaseUrl;

  return {
    port,
    databaseUrl,
    aiProvider,
    perplexityApiKey,
    useInMemoryDb,
  };
}
