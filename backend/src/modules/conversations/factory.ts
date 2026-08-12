/**
 * Repository factory — selects the persistence implementation
 * based on environment configuration.
 *
 * REPOSITORY_PROVIDER=memory  → InMemoryConversationRepository (tests, fast dev)
 * REPOSITORY_PROVIDER=supabase → SupabaseConversationRepository (production, real DB)
 *
 * If REPOSITORY_PROVIDER is not set, defaults to:
 * - supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are available
 * - memory otherwise
 *
 * Routes and CareerReasoningEngine never check this — they receive a
 * ConversationRepository and don't know which implementation is in use.
 */
import type { ConversationRepository } from "./repository.js";
import { InMemoryConversationRepository } from "./in-memory.js";
import { SupabaseConversationRepository } from "./supabase-repo.js";

export type RepositoryProvider = "memory" | "supabase";

export function createRepository(
  config: {
    provider?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  },
): ConversationRepository {
  const provider = (config.provider ?? "auto") as RepositoryProvider | "auto";

  if (provider === "memory") {
    return new InMemoryConversationRepository();
  }

  if (provider === "supabase") {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(
        "REPOSITORY_PROVIDER=supabase requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
      );
    }
    return new SupabaseConversationRepository(
      config.supabaseUrl,
      config.supabaseAnonKey,
    );
  }

  // Auto: prefer supabase when credentials are available
  if (config.supabaseUrl && config.supabaseAnonKey) {
    return new SupabaseConversationRepository(
      config.supabaseUrl,
      config.supabaseAnonKey,
    );
  }

  return new InMemoryConversationRepository();
}
