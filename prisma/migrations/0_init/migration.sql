-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."AgentPrompt" (
    "id" TEXT,
    "name" TEXT,
    "title" TEXT,
    "description" TEXT,
    "content" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN,
    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT,
    "content" TEXT,
    "sender" TEXT,
    "timestamp" TEXT,
    "userId" TEXT
);

-- CreateTable
CREATE TABLE "public"."ExchangeApiKey" (
    "id" TEXT,
    "userId" TEXT,
    "exchange" TEXT,
    "encryptedApiKey" TEXT,
    "encryptedApiSecret" TEXT,
    "encryptedPassphrase" TEXT,
    "isActive" BOOLEAN,
    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- CreateTable
CREATE TABLE "public"."JournalCheckIn" (

);

-- CreateTable
CREATE TABLE "public"."JournalEntry" (
    "id" TEXT,
    "userId" TEXT,
    "date" TEXT,
    "market" TEXT,
    "emotions" TEXT,
    "mistakes" TEXT,
    "lessons" TEXT,
    "tags" TEXT,
    "trades" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- CreateTable
CREATE TABLE "public"."JournalGoal" (
    "id" TEXT,
    "userId" TEXT,
    "text" TEXT,
    "target" TEXT,
    "due" TEXT,
    "status" TEXT,
    "progress" INTEGER,
    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- CreateTable
CREATE TABLE "public"."KnowledgeArticle" (
    "id" TEXT,
    "content" TEXT,
    "author" TEXT,
    "source" TEXT,
    "tags" TEXT,
    "embedding" TEXT
);

-- CreateTable
CREATE TABLE "public"."PortfolioSnapshot" (
    "id" TEXT,
    "timestamp" TEXT,
    "data" TEXT,
    "userId" TEXT
);

-- CreateTable
CREATE TABLE "public"."Position" (
    "id" TEXT,
    "userId" TEXT,
    "exchange" TEXT,
    "symbol" TEXT,
    "side" TEXT,
    "size" DOUBLE PRECISION,
    "notional" DOUBLE PRECISION,
    "entryPrice" DOUBLE PRECISION,
    "markPrice" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" INTEGER,
    "marginType" TEXT,
    "leverage" TEXT,
    "timestamp" TEXT,
    "isActive" BOOLEAN
);

-- CreateTable
CREATE TABLE "public"."Token" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "totalSupply" TEXT,
    "decimals" INTEGER,
    "priceUsd" DOUBLE PRECISION,
    "marketCapUsd" DOUBLE PRECISION,
    "volume24hUsd" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coingeckoId" TEXT,
    "createdAtBlock" INTEGER,
    "description" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "github" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "marketCapRank" INTEGER,
    "twitter" TEXT,
    "website" TEXT,
    "burnedTokensPercent" DOUBLE PRECISION,
    "canBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "canMint" BOOLEAN NOT NULL DEFAULT false,
    "canPause" BOOLEAN NOT NULL DEFAULT false,
    "contractCreator" TEXT,
    "contractSourceCode" TEXT,
    "creationTxHash" TEXT,
    "creatorHoldingPercent" DOUBLE PRECISION,
    "dexListings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "githubForks" INTEGER,
    "githubStars" INTEGER,
    "hasEmergencyStop" BOOLEAN NOT NULL DEFAULT false,
    "hasOwner" BOOLEAN NOT NULL DEFAULT false,
    "holderHistory" JSONB,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "lastCommitDate" TIMESTAMP(3),
    "lastRiskAssessment" TIMESTAMP(3),
    "liquidityLocked" BOOLEAN NOT NULL DEFAULT false,
    "liquidityLockedUntil" TIMESTAMP(3),
    "liquidityUsd" DOUBLE PRECISION,
    "ownerAddress" TEXT,
    "priceChange1h" DOUBLE PRECISION,
    "priceChange24h" DOUBLE PRECISION,
    "priceChange7d" DOUBLE PRECISION,
    "priceHistory" JSONB,
    "redditSubscribers" INTEGER,
    "riskFactors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rugpullRiskScore" DOUBLE PRECISION,
    "telegramMembers" INTEGER,
    "top10HoldersPercent" DOUBLE PRECISION,
    "top50HoldersPercent" DOUBLE PRECISION,
    "totalHolders" INTEGER,
    "tradingVolume1h" DOUBLE PRECISION,
    "twitterFollowers" INTEGER,
    "volumeHistory" JSONB,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT,
    "whatsappNumber" TEXT,
    "createdAt" TEXT
);

-- CreateTable
CREATE TABLE "public"."WalletAddress" (

);

-- CreateTable
CREATE TABLE "public"."btc_klines" (
    "open_time" TIMESTAMPTZ(6) NOT NULL,
    "open" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "close" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "close_time" TIMESTAMPTZ(6),
    "quote_asset_volume" DOUBLE PRECISION,
    "number_of_trades" INTEGER,
    "taker_buy_base_asset_volume" DOUBLE PRECISION,
    "taker_buy_quote_asset_volume" DOUBLE PRECISION,

    CONSTRAINT "btc_klines_pkey" PRIMARY KEY ("open_time")
);

-- CreateTable
CREATE TABLE "public"."predictions" (
    "prediction_time" TIMESTAMPTZ(6) NOT NULL,
    "time_window" VARCHAR(20) NOT NULL,
    "next_time_window" VARCHAR(20) NOT NULL,
    "next_open_price_change" DOUBLE PRECISION NOT NULL,
    "direction_strength" DOUBLE PRECISION NOT NULL,
    "total_strength" DOUBLE PRECISION NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "additional_info" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("prediction_time")
);

-- CreateTable
CREATE TABLE "public"."pulse_predictions" (
    "id" SERIAL NOT NULL,
    "token_address" VARCHAR,
    "token_name" VARCHAR,
    "prediction" INTEGER,
    "probability" DOUBLE PRECISION,
    "features" JSON,
    "created_at" TIMESTAMP(6),
    "model_version" DOUBLE PRECISION,

    CONSTRAINT "pulse_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pulse_users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64),
    "email" VARCHAR(120),
    "password_hash" VARCHAR(512),
    "is_admin" BOOLEAN,
    "isActive" BOOLEAN,
    "created_at" TIMESTAMP(6),

    CONSTRAINT "pulse_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."riddle" (
    "id" SERIAL NOT NULL,
    "createDate" TIMESTAMP(6),
    "type" VARCHAR(50),
    "question" TEXT,
    "isFirst" BOOLEAN,
    "isAsked" BOOLEAN,
    "answerTime" TIMESTAMP(6),

    CONSTRAINT "riddle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."riddle_answer" (
    "id" SERIAL NOT NULL,
    "createDate" TIMESTAMP(6),
    "riddleId" INTEGER NOT NULL,
    "answer" TEXT,

    CONSTRAINT "riddle_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_address_key" ON "public"."Token"("address" ASC);

-- CreateIndex
CREATE INDEX "ix_pulse_predictions_token_address" ON "public"."pulse_predictions"("token_address" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ix_pulse_users_email" ON "public"."pulse_users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ix_pulse_users_username" ON "public"."pulse_users"("username" ASC);

-- AddForeignKey
ALTER TABLE "public"."riddle_answer" ADD CONSTRAINT "riddle_answer_riddleId_fkey" FOREIGN KEY ("riddleId") REFERENCES "public"."riddle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

