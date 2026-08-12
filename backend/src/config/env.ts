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
  repositoryProvider: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function loadEnv(): EnvConfig {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const aiProvider = process.env.AI_PROVIDER ?? "mock";
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const repositoryProvider = process.env.REPOSITORY_PROVIDER ?? "auto";
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  // When no DATABASE_URL is set, we use in-memory repositories.
  // This lets the app run for development/testing without a Postgres instance.
  const useInMemoryDb = !databaseUrl && repositoryProvider !== "supabase" && !supabaseUrl;

  return {
    port,
    databaseUrl,
    aiProvider,
    perplexityApiKey,
    useInMemoryDb,
    repositoryProvider,
    supabaseUrl,
    supabaseAnonKey,
  };
}
