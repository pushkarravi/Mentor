import { describe, beforeAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { SupabaseConversationRepository } from "./supabase-repo.js";
import { repositoryContractTests } from "./contract-tests.js";

// Load .env manually — vitest doesn't auto-load it
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), "..", ".env");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx);
      const value = trimmed.substring(eqIdx + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found — tests will skip
  }
}

loadEnvFile();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Skip if no Supabase credentials
const hasCredentials = !!supabaseUrl && !!supabaseAnonKey;

describe.skipIf(!hasCredentials)(
  "SupabaseConversationRepository — contract tests",
  () => {
    const USER_ID = "test-user-contract";
    let adminClient: ReturnType<typeof createClient> | null = null;

    beforeAll(() => {
      if (hasCredentials) {
        adminClient = createClient(supabaseUrl!, supabaseAnonKey!);
      }
    });

    beforeEach(async () => {
      // Clean up all data for the test user before each test
      if (!adminClient) return;

      // Upsert the test user (needed for FK constraints)
      await adminClient.from("User").upsert({
        id: USER_ID,
        name: "Contract Test User",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const tables = [
        "PendingCandidate",
        "HypothesisEvidence",
        "CareerExperiment",
        "CareerHypothesis",
        "Memory",
        "Evidence",
        "Message",
        "Conversation",
        "CareerContext",
      ];
      for (const table of tables) {
        await adminClient.from(table).delete().eq("userId", USER_ID);
      }
    });

    repositoryContractTests(() => {
      if (!hasCredentials) {
        throw new Error("No Supabase credentials");
      }
      return new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
    });
  },
);
