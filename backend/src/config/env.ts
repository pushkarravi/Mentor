/**
 * Environment configuration for the backend.
 * All env access goes through this module.
 *
 * Prisma uses DATABASE_URL — never VITE_* variables.
 * VITE_* variables are for frontend use only.
 */
export interface EnvConfig {
  port: number;
  databaseUrl: string;
  aiProvider: string;
  perplexityApiKey?: string;
  repositoryProvider: string;
}

export function loadEnv(): EnvConfig {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const aiProvider = process.env.AI_PROVIDER ?? "mock";
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const repositoryProvider = process.env.REPOSITORY_PROVIDER ?? "auto";

  return {
    port,
    databaseUrl,
    aiProvider,
    perplexityApiKey,
    repositoryProvider,
  };
}
