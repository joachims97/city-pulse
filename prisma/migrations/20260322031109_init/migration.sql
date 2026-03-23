-- CreateTable
CREATE TABLE "Representative" (
    "id" TEXT NOT NULL,
    "wardId" INTEGER NOT NULL,
    "cityKey" TEXT NOT NULL DEFAULT 'chicago',
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Alderman',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "officeAddr" TEXT,
    "photoUrl" TEXT,
    "party" TEXT,
    "termStart" TIMESTAMP(3),
    "termEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedData" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "wardId" INTEGER,
    "queryParams" JSONB,

    CONSTRAINT "CachedData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL DEFAULT 'chicago',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "eventBodyName" TEXT NOT NULL,
    "eventLocation" TEXT,
    "matterTitle" TEXT NOT NULL,
    "matterType" TEXT,
    "matterStatus" TEXT,
    "agendaNote" TEXT,
    "minutesNote" TEXT,
    "aiSummary" TEXT,
    "summarizedAt" TIMESTAMP(3),
    "agendaFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL DEFAULT 'chicago',
    "fiscalYear" INTEGER NOT NULL,
    "department" TEXT NOT NULL,
    "fundCode" TEXT,
    "appropriationAccount" TEXT,
    "budgetedAmount" DOUBLE PRECISION NOT NULL,
    "ordinanceAmount" DOUBLE PRECISION,
    "dataType" TEXT NOT NULL DEFAULT 'ordinance',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint311" (
    "id" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL DEFAULT 'chicago',
    "srNumber" TEXT NOT NULL,
    "srType" TEXT NOT NULL,
    "srStatus" TEXT NOT NULL,
    "ward" INTEGER,
    "community" TEXT,
    "streetAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "closedDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint311_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL DEFAULT 'chicago',
    "inspectionId" TEXT NOT NULL,
    "dbaName" TEXT NOT NULL,
    "licenseNo" TEXT,
    "address" TEXT,
    "zip" TEXT,
    "inspectionType" TEXT,
    "results" TEXT,
    "violations" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ward" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Representative_cityKey_wardId_idx" ON "Representative"("cityKey", "wardId");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_cityKey_wardId_key" ON "Representative"("cityKey", "wardId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedData_cacheKey_key" ON "CachedData"("cacheKey");

-- CreateIndex
CREATE INDEX "CachedData_cacheKey_idx" ON "CachedData"("cacheKey");

-- CreateIndex
CREATE INDEX "CachedData_cityKey_dataType_wardId_idx" ON "CachedData"("cityKey", "dataType", "wardId");

-- CreateIndex
CREATE INDEX "CachedData_expiresAt_idx" ON "CachedData"("expiresAt");

-- CreateIndex
CREATE INDEX "AgendaItem_cityKey_eventDate_idx" ON "AgendaItem"("cityKey", "eventDate");

-- CreateIndex
CREATE INDEX "AgendaItem_eventDate_idx" ON "AgendaItem"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaItem_cityKey_eventId_key" ON "AgendaItem"("cityKey", "eventId");

-- CreateIndex
CREATE INDEX "BudgetItem_cityKey_fiscalYear_dataType_idx" ON "BudgetItem"("cityKey", "fiscalYear", "dataType");

-- CreateIndex
CREATE INDEX "BudgetItem_department_idx" ON "BudgetItem"("department");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_cityKey_fiscalYear_dataType_department_appropria_key" ON "BudgetItem"("cityKey", "fiscalYear", "dataType", "department", "appropriationAccount");

-- CreateIndex
CREATE INDEX "Complaint311_cityKey_ward_createdDate_idx" ON "Complaint311"("cityKey", "ward", "createdDate");

-- CreateIndex
CREATE INDEX "Complaint311_srType_srStatus_idx" ON "Complaint311"("srType", "srStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint311_cityKey_srNumber_key" ON "Complaint311"("cityKey", "srNumber");

-- CreateIndex
CREATE INDEX "Inspection_cityKey_ward_idx" ON "Inspection"("cityKey", "ward");

-- CreateIndex
CREATE INDEX "Inspection_inspectionDate_idx" ON "Inspection"("inspectionDate");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_cityKey_inspectionId_key" ON "Inspection"("cityKey", "inspectionId");
