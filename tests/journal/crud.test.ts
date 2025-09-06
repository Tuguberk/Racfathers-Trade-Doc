import { prisma } from "../../src/db/prisma.js";

describe("Journal Database CRUD Operations", () => {
  const testUserId = "test-user-123";

  beforeAll(async () => {
    // Ensure test user exists
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        whatsappNumber: "+1234567890",
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.journalCheckIn.deleteMany({ where: { userId: testUserId } });
    await prisma.journalGoal.deleteMany({ where: { userId: testUserId } });
    await prisma.journalEntry.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  describe("JournalEntry CRUD", () => {
    test("should create a journal entry", async () => {
      const entry = await prisma.journalEntry.create({
        data: {
          userId: testUserId,
          market: "BTC/USDT",
          emotions: "Confident but nervous",
          mistakes: "Entered too early",
          lessons: "Wait for confirmation",
          tags: ["patience", "timing"],
          trades: [{ symbol: "BTC/USDT", direction: "long", r: 2.5 }],
        },
      });

      expect(entry.id).toBeDefined();
      expect(entry.market).toBe("BTC/USDT");
      expect(entry.tags).toEqual(["patience", "timing"]);
    });

    test("should retrieve journal entries", async () => {
      const entries = await prisma.journalEntry.findMany({
        where: { userId: testUserId },
        orderBy: { date: "desc" },
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].userId).toBe(testUserId);
    });

    test("should filter entries by tags", async () => {
      const entries = await prisma.journalEntry.findMany({
        where: {
          userId: testUserId,
          tags: { has: "patience" },
        },
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].tags).toContain("patience");
    });
  });

  describe("JournalGoal CRUD", () => {
    test("should create a goal", async () => {
      const goal = await prisma.journalGoal.create({
        data: {
          userId: testUserId,
          text: "Improve win rate to 70%",
          target: "Risk management",
          status: "ACTIVE",
        },
      });

      expect(goal.id).toBeDefined();
      expect(goal.text).toBe("Improve win rate to 70%");
      expect(goal.status).toBe("ACTIVE");
    });

    test("should create check-ins for goals", async () => {
      const goal = await prisma.journalGoal.findFirst({
        where: { userId: testUserId },
      });

      if (goal) {
        const checkIn = await prisma.journalCheckIn.create({
          data: {
            userId: testUserId,
            goalId: goal.id,
            note: "Making good progress",
            score: 7,
          },
        });

        expect(checkIn.goalId).toBe(goal.id);
        expect(checkIn.score).toBe(7);
      }
    });

    test("should retrieve goals with check-ins", async () => {
      const goals = await prisma.journalGoal.findMany({
        where: { userId: testUserId },
        include: { checkIns: true },
      });

      expect(goals.length).toBeGreaterThan(0);
      expect(goals[0]).toHaveProperty("checkIns");
    });
  });

  describe("Data Integrity", () => {
    test("should maintain foreign key relationships", async () => {
      const goal = await prisma.journalGoal.findFirst({
        where: { userId: testUserId },
        include: { checkIns: true },
      });

      if (goal && goal.checkIns.length > 0) {
        expect(goal.checkIns[0].goalId).toBe(goal.id);
        expect(goal.checkIns[0].userId).toBe(testUserId);
      }
    });

    test("should handle cascading deletes", async () => {
      // Create a goal with check-ins
      const goal = await prisma.journalGoal.create({
        data: {
          userId: testUserId,
          text: "Test goal for deletion",
        },
      });

      await prisma.journalCheckIn.create({
        data: {
          userId: testUserId,
          goalId: goal.id,
          note: "Test check-in",
        },
      });

      // Delete the goal - check-ins should be deleted too
      await prisma.journalGoal.delete({ where: { id: goal.id } });

      const remainingCheckIns = await prisma.journalCheckIn.findMany({
        where: { goalId: goal.id },
      });

      expect(remainingCheckIns.length).toBe(0);
    });
  });
});
