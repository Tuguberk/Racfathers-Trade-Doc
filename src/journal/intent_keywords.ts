export function looksLikeJournal(msg: string): boolean {
  const kw = [
    "journal",
    "log",
    "note",
    "diary",
    "review",
    "post-mortem",
    "weekly review",
    "monthly review",
    "summary",
    "retro",
    "goal",
    "goals",
    "check-in",
    "checkin",
    "streak",
    "win rate",
    "lessons",
    "mistakes",
    "tags:",
  ];
  const m = msg.toLowerCase();
  return kw.some((k) => m.includes(k));
}
