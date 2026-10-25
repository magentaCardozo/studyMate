-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_BLANK', 'MATCHING');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'MISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "externalAuthId" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
    "institutionId" UUID,
    "faculty" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "aiConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "clientType" TEXT NOT NULL DEFAULT 'web',
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CD',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "semesterId" UUID,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "faculty" TEXT,
    "description" TEXT,
    "color" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "confidence" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastOpenedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "parentFolderId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "folderId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "learningObjectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definitions" JSONB NOT NULL DEFAULT '[]',
    "formulas" JSONB NOT NULL DEFAULT '[]',
    "examples" JSONB NOT NULL DEFAULT '[]',
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "LessonStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "estimatedMinutes" INTEGER,
    "revisionDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "folderId" UUID,
    "lessonId" UUID,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "processingError" TEXT,
    "extractedTextKey" TEXT,
    "extractionMethod" TEXT,
    "pageCount" INTEGER,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "page" INTEGER,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentProcessingJob" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "folderId" UUID,
    "lessonId" UUID,
    "documentId" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "lessonId" UUID,
    "title" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardDeck" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "folderId" UUID,
    "lessonId" UUID,
    "title" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "provider" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashcardDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" UUID NOT NULL,
    "deckId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sourceReference" JSONB,
    "difficulty" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "flashcardId" UUID NOT NULL,
    "responseRating" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "intervalDays" DOUBLE PRECISION NOT NULL,
    "clientOpId" TEXT,

    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "lessonId" UUID,
    "title" TEXT NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "origin" TEXT NOT NULL DEFAULT 'ai',
    "provider" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "sourceReference" JSONB,
    "difficulty" TEXT,
    "topic" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'practice',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResponse" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'exam',
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "targetGrade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lessonId" UUID,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "activityType" TEXT NOT NULL,
    "objective" TEXT,
    "reason" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "grounded" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tombstone" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalAuthId_key" ON "User"("externalAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_country_key" ON "Institution"("name", "country");

-- CreateIndex
CREATE INDEX "AcademicYear_userId_idx" ON "AcademicYear"("userId");

-- CreateIndex
CREATE INDEX "Semester_academicYearId_idx" ON "Semester"("academicYearId");

-- CreateIndex
CREATE INDEX "Course_userId_archivedAt_idx" ON "Course"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Course_semesterId_idx" ON "Course"("semesterId");

-- CreateIndex
CREATE INDEX "Folder_courseId_parentFolderId_sortOrder_idx" ON "Folder"("courseId", "parentFolderId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_courseId_folderId_sortOrder_idx" ON "Lesson"("courseId", "folderId", "sortOrder");

-- CreateIndex
CREATE INDEX "Document_userId_courseId_idx" ON "Document"("userId", "courseId");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Document_lessonId_idx" ON "Document"("lessonId");

-- CreateIndex
CREATE INDEX "DocumentChunk_userId_idx" ON "DocumentChunk"("userId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_ordinal_idx" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_status_runAfter_idx" ON "DocumentProcessingJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_documentId_idx" ON "DocumentProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "Note_userId_updatedAt_idx" ON "Note"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_courseId_idx" ON "Note"("courseId");

-- CreateIndex
CREATE INDEX "Note_lessonId_idx" ON "Note"("lessonId");

-- CreateIndex
CREATE INDEX "Summary_userId_createdAt_idx" ON "Summary"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FlashcardDeck_userId_idx" ON "FlashcardDeck"("userId");

-- CreateIndex
CREATE INDEX "FlashcardDeck_courseId_idx" ON "FlashcardDeck"("courseId");

-- CreateIndex
CREATE INDEX "Flashcard_deckId_dueAt_idx" ON "Flashcard"("deckId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardReview_clientOpId_key" ON "FlashcardReview"("clientOpId");

-- CreateIndex
CREATE INDEX "FlashcardReview_userId_reviewedAt_idx" ON "FlashcardReview"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "FlashcardReview_flashcardId_idx" ON "FlashcardReview"("flashcardId");

-- CreateIndex
CREATE INDEX "Quiz_userId_createdAt_idx" ON "Quiz"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_courseId_idx" ON "Quiz"("courseId");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_ordinal_idx" ON "QuizQuestion"("quizId", "ordinal");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_startedAt_idx" ON "QuizAttempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizResponse_attemptId_questionId_key" ON "QuizResponse"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "StudyGoal_userId_targetDate_idx" ON "StudyGoal"("userId", "targetDate");

-- CreateIndex
CREATE INDEX "StudySession_userId_scheduledStart_idx" ON "StudySession"("userId", "scheduledStart");

-- CreateIndex
CREATE INDEX "StudySession_courseId_idx" ON "StudySession"("courseId");

-- CreateIndex
CREATE INDEX "ChatThread_userId_updatedAt_idx" ON "ChatThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_targetType_targetId_idx" ON "AiFeedback"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "SyncOperation_userId_appliedAt_idx" ON "SyncOperation"("userId", "appliedAt");

-- CreateIndex
CREATE INDEX "Tombstone_userId_deletedAt_idx" ON "Tombstone"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGoal" ADD CONSTRAINT "StudyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGoal" ADD CONSTRAINT "StudyGoal_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tombstone" ADD CONSTRAINT "Tombstone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
