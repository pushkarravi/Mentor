/**
 * End-to-end persistence test — verifies data survives repository
 * instance recreation (simulating a process restart).
 *
 * This test runs only against the Supabase implementation, since the
 * in-memory implementation loses data on recreation by design.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { SupabaseConversationRepository } from "./supabase-repo.js";

// Load .env
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not found — test will skip
  }
}

loadEnvFile();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const hasCredentials = !!supabaseUrl && !!supabaseAnonKey;

describe.skipIf(!hasCredentials)(
  "Supabase persistence — data survives repository recreation",
  () => {
    const USER_ID = "test-user-persistence";
    let adminClient: ReturnType<typeof createClient>;

    beforeAll(() => {
      adminClient = createClient(supabaseUrl!, supabaseAnonKey!);
    });

    beforeEach(async () => {
      // Clean up
      await adminClient.from("User").upsert({
        id: USER_ID,
        name: "Persistence Test User",
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

    it("career context persists across repository recreation", async () => {
      // Write with one repository instance
      const repo1 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      await repo1.saveCareerContext(USER_ID, {
        currentRole: "Staff Engineer",
        yearsExperience: 10,
        targetOutcome: "Principal Engineer",
        whyNotYet: "Need broader org influence",
      });

      // Read with a new repository instance (simulates restart)
      const repo2 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const ctx = await repo2.getCareerContext(USER_ID);
      expect(ctx).not.toBeNull();
      expect(ctx!.currentRole).toBe("Staff Engineer");
      expect(ctx!.yearsExperience).toBe(10);
      expect(ctx!.targetOutcome).toBe("Principal Engineer");
    });

    it("conversation + messages persist across repository recreation", async () => {
      const repo1 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const conv = await repo1.createConversation(USER_ID, "Persisted Chat");
      await repo1.addMessage(conv.id, "user", "Hello from session 1");
      await repo1.addMessage(conv.id, "assistant", "Hi from the assistant");

      const repo2 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const conv2 = await repo2.getConversation(USER_ID, conv.id);
      expect(conv2).not.toBeNull();
      expect(conv2!.messages.length).toBe(2);
      expect(conv2!.messages[0].content).toBe("Hello from session 1");
      expect(conv2!.messages[1].content).toBe("Hi from the assistant");
    });

    it("full M0 loop persists across repository recreation", async () => {
      // Session 1: create context, conversation, evidence, hypothesis, experiment
      const repo1 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      await repo1.saveCareerContext(USER_ID, {
        currentRole: "Senior Engineer",
        yearsExperience: 7,
        targetOutcome: "Staff Engineer",
        whyNotYet: "Need architecture experience",
      });

      const hyp = await repo1.createHypothesis(USER_ID, {
        statement: "My manager will support my growth",
        creationRationale: "Based on recent 1:1 conversations",
      });

      const ev = await repo1.addEvidence(USER_ID, {
        sourceType: "user_report",
        epistemicType: "fact",
        description: "Manager said I'm ready for more responsibility",
      });

      await repo1.addHypothesisEvidenceLink(USER_ID, {
        hypothesisId: hyp.id,
        evidenceId: ev.id,
        linkType: "supports",
      });

      const exp = await repo1.createExperiment(USER_ID, {
        hypothesisId: hyp.id,
        description: "Ask for a stretch assignment",
        supportingSignal: "Manager assigns one",
        contradictingSignal: "Manager declines",
        inconclusiveSignal: "Manager says maybe later",
        rationale: "To test if my manager actively supports my growth",
      });

      // Session 2: record outcome and review
      const repo2 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const outcomeResult = await repo2.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
        outcome: "My manager gave me the platform redesign to lead",
        outcomeClassification: "supports",
        observedFact: "I was assigned as tech lead for the platform redesign",
      });
      expect(outcomeResult).not.toBeNull();
      expect(outcomeResult!.evidence).not.toBeNull();

      // Session 3: review the outcome
      const repo3 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const reviewResult = await repo3.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
        newConfidence: "moderate",
        newAssessmentRationale: "One supporting observed outcome from a stretch assignment",
      });
      expect(reviewResult).not.toBeNull();
      expect(reviewResult!.link).not.toBeNull();
      expect(reviewResult!.link!.linkType).toBe("supports");
      expect(reviewResult!.hypothesis.confidence).toBe("moderate");

      // Session 4: verify all data persisted
      const repo4 = new SupabaseConversationRepository(supabaseUrl!, supabaseAnonKey!);
      const hypCheck = await repo4.getHypothesis(USER_ID, hyp.id);
      expect(hypCheck!.confidence).toBe("moderate");
      expect(hypCheck!.lastAssessmentRationale).toBe(
        "One supporting observed outcome from a stretch assignment",
      );
      expect(hypCheck!.creationRationale).toBe("Based on recent 1:1 conversations");

      const expCheck = await repo4.getExperiment(USER_ID, exp.id);
      expect(expCheck!.outcome).toBe("My manager gave me the platform redesign to lead");
      expect(expCheck!.outcomeClassification).toBe("supports");
      expect(expCheck!.reviewedAt).not.toBeNull();

      const links = await repo4.getHypothesisEvidenceLinks(USER_ID, hyp.id);
      // Should have 2 links: the manually created one + the Stage F review one
      expect(links.length).toBe(2);
      const linkTypes = links.map((l) => l.link.linkType);
      expect(linkTypes).toContain("supports");
    });
  },
);
