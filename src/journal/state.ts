export type JournalAction =
  | "ADD_ENTRY"
  | "GET_ENTRIES"
  | "SET_GOAL"
  | "GET_GOALS"
  | "CHECKIN"
  | "SUMMARY";

export type JournalState = {
  userId: string;
  inputMessage: string;

  isJournalRequest: boolean | null;
  journalAction: JournalAction | null;

  // slots parsed from intent
  filters?: { from?: string; to?: string; tag?: string };
  entryDraft?: {
    date?: string;
    market?: string;
    emotions?: string;
    mistakes?: string;
    lessons?: string;
    tags?: string[];
    trades?: Array<{
      symbol: string;
      direction: "long" | "short";
      size?: number;
      r?: number;
      pnl?: number;
    }>;
  };
  goalDraft?: { text: string; target?: string; due?: string };

  entries?: any[];
  goals?: any[];
  summaryText?: string;
  finalResponse?: string;
};
