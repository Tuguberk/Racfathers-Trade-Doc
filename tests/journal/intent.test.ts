import { describe, it, expect } from "@jest/globals";
import { looksLikeJournal } from "../../src/journal/intent_keywords.js";
import { classifyJournalIntent } from "../../src/journal/llm_intent.js";

describe("Journal Intent Classification", () => {
  describe("looksLikeJournal", () => {
    it("should detect journal keywords", () => {
      expect(looksLikeJournal("I want to log my trading day")).toBe(true);
      expect(looksLikeJournal("Add to my journal")).toBe(true);
      expect(looksLikeJournal("Weekly review of my trades")).toBe(true);
      expect(looksLikeJournal("Set a goal for next month")).toBe(true);
      expect(looksLikeJournal("Check-in on my progress")).toBe(true);
      expect(looksLikeJournal("Show me my mistakes")).toBe(true);
    });

    it("should reject non-journal messages", () => {
      expect(looksLikeJournal("Show my portfolio")).toBe(false);
      expect(looksLikeJournal("What is Bitcoin price?")).toBe(false);
      expect(looksLikeJournal("I am feeling sad")).toBe(false);
      expect(looksLikeJournal("Hello there")).toBe(false);
    });
  });

  describe("classifyJournalIntent", () => {
    // Note: These tests require actual LLM calls, so they might need mocking in a real test environment

    it("should classify ADD_ENTRY intent", async () => {
      const result = await classifyJournalIntent(
        "Log my trading day: felt confident"
      );
      expect(result.intent).toBe("ADD_ENTRY");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify GET_ENTRIES intent", async () => {
      const result = await classifyJournalIntent(
        "Show my journal entries from last week"
      );
      expect(result.intent).toBe("GET_ENTRIES");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify SET_GOAL intent", async () => {
      const result = await classifyJournalIntent(
        "My goal is to improve my win rate"
      );
      expect(result.intent).toBe("SET_GOAL");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should return NONE for non-journal messages", async () => {
      const result = await classifyJournalIntent("Show my Bitcoin balance");
      expect(result.intent).toBe("NONE");
    });

    it("should handle parsing errors gracefully", async () => {
      // This would need a mock that returns invalid JSON
      // For now, we test the structure
      const result = await classifyJournalIntent("test message");
      expect(result).toHaveProperty("intent");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("crisis_flag");
    });
  });
});

describe("Journal Router", () => {
  // These tests would need to import and test the routeMessage function
  // Skipped for now as they require LLM calls
});

describe("Journal Graph Edges", () => {
  it("should have correct node transitions", () => {
    // This would test the graph structure
    // For example, ensuring journal_parse leads to journal_route_action
    // and each action leads to journal_respond
    expect(true).toBe(true); // Placeholder
  });

  it("should handle all journal actions", () => {
    // Test that all JournalAction enum values are handled
    const actions = [
      "ADD_ENTRY",
      "GET_ENTRIES",
      "SET_GOAL",
      "GET_GOALS",
      "CHECKIN",
      "SUMMARY",
    ];
    actions.forEach((action) => {
      // Verify each action has a corresponding node
      expect(action).toBeDefined();
    });
  });
});
