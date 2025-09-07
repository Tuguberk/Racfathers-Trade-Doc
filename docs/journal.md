# Trading Journal Feature Documentation

## Overview

The Trading Journal is a new feature that allows users to maintain a personal trading diary, track progress towards goals, and get AI-powered insights. It operates as a separate subgraph within the main agent system, providing a clean separation from portfolio and crisis management flows.

## Features

### 1. Journal Entries

- **Add entries**: Log daily trading thoughts, emotions, mistakes, and lessons
- **Retrieve entries**: Search entries by date range or tags
- **Smart parsing**: Automatically extracts emotions, mistakes, lessons from natural language

### 2. Goal Management

- **Set goals**: Create trading-related goals with optional targets and due dates
- **Track progress**: Check-in with progress updates and scores
- **Goal status**: Goals can be ACTIVE, COMPLETED, or ABANDONED

### 3. AI-Powered Summaries

- **Performance metrics**: Win rate calculation from logged trades
- **Pattern recognition**: Identifies top mistakes and lessons
- **Encouraging insights**: Motivational summaries focusing on growth

## Usage Examples

### Adding Journal Entries

**Simple entry:**

```
"Log my trading day: felt anxious about the BTC position"
```

**Structured entry:**

```
"Journal entry: market: BTC/USDT, emotions: confident but nervous,
mistakes: entered too early, lessons: wait for confirmation, tags: patience"
```

**Trade logging:**

```
"Note today's trade: BTC long, size 1.0, R +2.5, profitable scalp"
```

### Managing Goals

**Setting goals:**

```
"My goal is to improve my win rate to 70% by end of month"
```

**Progress check-ins:**

```
"Check-in on my goal: 65% progress, getting better at entries"
```

**Goal with target:**

```
"Set goal: reduce max drawdown to 5%, target: risk management improvement"
```

### Retrieving Information

**View entries:**

```
"Show my journal entries from last week"
"Get entries tagged with mistakes"
```

**View goals:**

```
"List my goals"
"Show my active goals"
```

**Get summaries:**

```
"Weekly review"
"Monthly summary"
"Give me a journal summary"
```

## Intent Classification

The system uses both keyword matching and LLM classification to route journal requests:

### Intents Supported:

- **ADD_ENTRY**: Default for logging activities
- **GET_ENTRIES**: Retrieve historical entries
- **SET_GOAL**: Create new goals
- **GET_GOALS**: List existing goals
- **CHECKIN**: Update progress on goals
- **SUMMARY**: Generate AI-powered insights
- **NONE**: Not journal-related (falls back to main agent)

### Keyword Triggers:

- journal, log, note, diary, review, post-mortem
- weekly review, monthly review, summary, retro
- goal, goals, check-in, checkin, streak, win rate
- lessons, mistakes, tags:

## Architecture

### Database Models

```prisma
model JournalEntry {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime @default(now())
  market    String?
  emotions  String?
  mistakes  String?
  lessons   String?
  tags      String[]
  trades    Json?    // Array of trade objects with R multiples
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model JournalGoal {
  id        String     @id @default(cuid())
  userId    String
  text      String
  target    String?
  due       DateTime?
  status    GoalStatus @default(ACTIVE)
  progress  Int        @default(0)
  checkIns  JournalCheckIn[]
}

model JournalCheckIn {
  id        String   @id @default(cuid())
  userId    String
  goalId    String
  note      String?
  score     Int?
  createdAt DateTime @default(now())
  goal      JournalGoal @relation(fields: [goalId], references: [id])
}
```

### Routing Flow

1. **Crisis Detection**: Highest priority, routes to crisis management
2. **Keyword Prefilter**: Fast check for journal-related terms
3. **LLM Classification**: Detailed intent analysis with confidence scoring
4. **Confidence Gate**: Minimum 60% confidence, else defaults to ADD_ENTRY
5. **Subgraph Execution**: Isolated journal processing

### Subgraph Nodes

- **journal_parse**: Extract structured data from natural language
- **journal_add_entry**: Create new journal entries
- **journal_get_entries**: Retrieve entries with filtering
- **journal_set_goal**: Create new goals
- **journal_get_goals**: List user's goals
- **journal_checkin**: Update goal progress
- **journal_summary**: Generate AI-powered insights
- **journal_respond**: Format final response

## API Integration Notes

### For Future UI Development

The journal feature provides structured data that can be easily consumed by frontend applications:

**Entry Object:**

```typescript
{
  id: string;
  date: Date;
  market?: string;
  emotions?: string;
  mistakes?: string;
  lessons?: string;
  tags: string[];
  trades?: Trade[];
}
```

**Goal Object:**

```typescript
{
  id: string;
  text: string;
  target?: string;
  due?: Date;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  progress: number;
  checkIns: CheckIn[];
}
```

**Metrics Available:**

- Win rate calculation from trades
- Average R multiple
- Entry frequency
- Tag-based categorization
- Progress tracking

## Configuration

### Feature Flags

- `JOURNAL_FEATURE_ENABLED`: Main feature toggle (default: true)
- `JOURNAL_REMINDERS_ENABLED`: Daily check-in reminders (default: false)

### Safety Features

- Crisis detection takes priority over journal routing
- No hardcoded fallbacks or phone numbers
- Proper error handling with user-friendly messages
- Emoji-based visual formatting (📒, 🎯, 🧾)

## Performance Considerations

- Indexed database queries on userId, date, status
- Limited result sets (max 10 entries per query)
- Efficient LLM prompting with temperature 0 for classification
- JSON-only responses from classification to minimize tokens

## Future Enhancements

- Automated pattern detection in entries
- Integration with portfolio performance data
- Advanced analytics and trend visualization
- Social features (sharing insights, community goals)
- Mobile app integration
- Voice-to-text journal entries

This feature maintains strict separation from existing flows while providing powerful journaling capabilities that help traders improve through reflection and goal tracking.
