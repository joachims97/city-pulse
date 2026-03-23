ALTER TABLE "AgendaItem"
ADD COLUMN "fullText" TEXT,
ADD COLUMN "fullTextSourceUrl" TEXT,
ADD COLUMN "fullTextFetchedAt" TIMESTAMP(3);
