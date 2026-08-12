import { describe } from "vitest";
import { InMemoryConversationRepository } from "./in-memory.js";
import { repositoryContractTests } from "./contract-tests.js";

describe("InMemoryConversationRepository — contract tests", () => {
  repositoryContractTests(() => new InMemoryConversationRepository());
});
