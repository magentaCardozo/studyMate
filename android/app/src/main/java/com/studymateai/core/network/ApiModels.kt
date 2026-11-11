package com.studymateai.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Modèles conformes au contrat partagé shared/api-contracts/openapi.yaml. */

@Serializable
data class Envelope<T>(val data: T)

@Serializable
data class ErrorBody(val error: ErrorDetail)

@Serializable
data class ErrorDetail(val code: String, val message: String)

@Serializable
data class UserDto(
    val id: String,
    val name: String,
    val email: String,
    val preferredLanguage: String = "fr",
    val timezone: String = "Africa/Kinshasa",
    val aiConsentAt: String? = null,
    val settings: JsonObject? = null,
)

@Serializable
data class SessionDto(val user: UserDto, val accessToken: String, val refreshToken: String, val accessExpiresIn: Int)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RegisterRequest(val name: String, val email: String, val password: String, val preferredLanguage: String = "fr", val timezone: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class CreateCourseRequest(val id: String? = null, val title: String, val code: String? = null, val semesterId: String? = null)

@Serializable
data class SemesterRef(val id: String, val name: String)

@Serializable
data class CourseDto(
    val id: String,
    val title: String,
    val code: String? = null,
    val description: String? = null,
    val color: String? = null,
    val isDemo: Boolean = false,
    val archivedAt: String? = null,
    val updatedAt: String,
    val semester: SemesterRef? = null,
    val semesterId: String? = null,
)

@Serializable
data class FolderDto(val id: String, val courseId: String, val parentFolderId: String? = null, val name: String, val sortOrder: Int = 0, val archivedAt: String? = null, val updatedAt: String)

@Serializable
data class LessonDto(
    val id: String,
    val courseId: String,
    val folderId: String? = null,
    val title: String,
    val description: String? = null,
    val content: String = "",
    val learningObjectives: List<String> = emptyList(),
    val status: String = "NOT_STARTED",
    val sortOrder: Int = 0,
    val estimatedMinutes: Int? = null,
    val updatedAt: String,
)

@Serializable
data class NoteDto(
    val id: String,
    val title: String,
    val content: String = "",
    val courseId: String? = null,
    val folderId: String? = null,
    val lessonId: String? = null,
    val documentId: String? = null,
    val updatedAt: String,
)

@Serializable
data class DocumentDto(
    val id: String,
    val fileName: String,
    val mimeType: String,
    val fileSize: Long,
    /** Dossier de la base de connaissances (toujours défini côté serveur). */
    val courseId: String? = null,
    val folderId: String? = null,
    val source: String = "file",
    val processingStatus: String,
    val processingError: String? = null,
    val pageCount: Int? = null,
    val updatedAt: String,
)

@Serializable
data class DeckDto(val id: String, val title: String, val courseId: String? = null, val lessonId: String? = null, val origin: String = "manual", val updatedAt: String)

@Serializable
data class FlashcardDto(
    val id: String,
    val deckId: String,
    val question: String,
    val answer: String,
    val easeFactor: Double = 2.5,
    val intervalDays: Double = 0.0,
    val repetitions: Int = 0,
    val lapses: Int = 0,
    val dueAt: String,
    val updatedAt: String,
)

@Serializable
data class QuestionDto(
    val id: String,
    val ordinal: Int,
    val question: String,
    val questionType: String,
    val options: JsonElement? = null,
    val correctAnswer: JsonElement? = null,
    val explanation: String? = null,
    val points: Double = 1.0,
)

@Serializable
data class QuizDto(
    val id: String,
    val title: String,
    val courseId: String? = null,
    val lessonId: String? = null,
    val configuration: JsonObject? = null,
    val createdAt: String,
    val offlineEligible: Boolean = false,
    val questions: List<QuestionDto> = emptyList(),
)

@Serializable
data class GoalDto(val id: String, val kind: String, val title: String, val courseId: String? = null, val targetDate: String? = null, val status: String = "active", val updatedAt: String)

@Serializable
data class SessionItemDto(
    val id: String,
    val courseId: String,
    val lessonId: String? = null,
    val scheduledStart: String,
    val scheduledEnd: String,
    val activityType: String,
    val objective: String? = null,
    val reason: String? = null,
    val status: String,
    val updatedAt: String,
)

@Serializable
data class TombstoneDto(val entity: String, val entityId: String, val deletedAt: String)

@Serializable
data class ChangesDto(
    val serverTime: String,
    val courses: List<CourseDto> = emptyList(),
    val folders: List<FolderDto> = emptyList(),
    val lessons: List<LessonDto> = emptyList(),
    val notes: List<NoteDto> = emptyList(),
    val documents: List<DocumentDto> = emptyList(),
    val decks: List<DeckDto> = emptyList(),
    val flashcards: List<FlashcardDto> = emptyList(),
    val goals: List<GoalDto> = emptyList(),
    val sessions: List<SessionItemDto> = emptyList(),
    val quizzes: List<QuizDto> = emptyList(),
    val tombstones: List<TombstoneDto> = emptyList(),
)

@Serializable
data class SyncOperationDto(
    val opId: String,
    val entity: String,
    val action: String,
    val id: String,
    val data: JsonObject,
    val baseUpdatedAt: String? = null,
    val clientTime: String? = null,
)

@Serializable
data class PushRequest(val operations: List<SyncOperationDto>)

@Serializable
data class OperationResult(val opId: String, val status: String, val entity: String, val id: String, val server: JsonElement? = null, val message: String? = null, val code: String? = null)

@Serializable
data class PushResponse(val serverTime: String, val results: List<OperationResult>)

@Serializable
data class UploadUrlRequest(val fileName: String, val mimeType: String, val fileSize: Long, val courseId: String, val folderId: String? = null, val source: String = "file")

@Serializable
data class PasteTextRequest(val title: String, val content: String, val courseId: String, val folderId: String? = null)

@Serializable
data class KnowledgeBaseDto(val documents: Int, val ready: Int, val processing: Int, val failed: Int, val characters: Int, val canGenerate: Boolean)

/** Onglet Révisions : QCM à terminer, questions ratées, flash-cards à réviser. */
@Serializable
data class RefDto(val id: String, val title: String)

@Serializable
data class ToFinishDto(val quizId: String, val title: String, val course: RefDto? = null, val isMockExam: Boolean = false, val isReview: Boolean = false, val totalQuestions: Int, val status: String, val answered: Int = 0, val startedAt: String? = null)

@Serializable
data class MistakeDto(val questionId: String, val question: String, val quiz: RefDto, val course: RefDto? = null, val wrongCount: Int, val lastAnsweredAt: String)

@Serializable
data class CardCountsDto(val due: Int, val new: Int)

@Serializable
data class ReviewDto(val toFinish: List<ToFinishDto>, val mistakes: List<MistakeDto>, val cards: CardCountsDto)

@Serializable
data class MistakesQuizRequest(val courseId: String? = null)

/** Base de connaissances réunie : texte extrait de tous les documents du dossier. */
@Serializable
data class KbPageDto(val page: Int? = null, val text: String, val source: String? = null, val aVerifier: List<String> = emptyList(), val texteImages: String? = null)

@Serializable
data class KbDocumentDto(val id: String, val fileName: String, val source: String, val pageCount: Int? = null, val createdAt: String, val corrected: Boolean = false, val pages: List<KbPageDto>)

@Serializable
data class KbPendingDto(val id: String, val fileName: String, val status: String)

@Serializable
data class KbContentDto(val courseId: String, val title: String, val characters: Int, val documents: List<KbDocumentDto>, val pending: List<KbPendingDto> = emptyList())

/** Contenu des trois sous-dossiers fixes d'un dossier, du plus récent au plus ancien. */
@Serializable
data class RevisionItemDto(val id: String, val title: String, val createdAt: String, val questions: Int? = null, val lastScore: Int? = null, val cards: Int? = null, val length: String? = null)

@Serializable
data class CourseRevisionsDto(val courseId: String, val qcm: List<RevisionItemDto>, val flashcards: List<RevisionItemDto>, val fiches: List<RevisionItemDto>)

@Serializable
data class UploadInfo(val method: String, val url: String, val headers: Map<String, String> = emptyMap())

@Serializable
data class UploadUrlResponse(val document: DocumentDto, val upload: UploadInfo)

@Serializable
data class DownloadUrlRequest(val inline: Boolean = false)

@Serializable
data class DownloadUrlResponse(val url: String, val fileName: String, val mimeType: String, val fileSize: Long)

@Serializable
data class ExtractedPage(val page: Int? = null, val text: String)

@Serializable
data class ExtractionDto(val method: String, val pageCount: Int? = null, val pages: List<ExtractedPage>, val warnings: List<String> = emptyList())

@Serializable
data class AiStatusDto(val provider: String? = null, val configured: Boolean, val demoMode: Boolean, val external: Boolean, val requiresConsent: Boolean, val usedToday: Int, val dailyLimit: Int)

@Serializable
data class GenerateRequest(
    val courseId: String? = null,
    val folderId: String? = null,
    val lessonId: String? = null,
    val documentIds: List<String>? = null,
    val length: String? = null,
    val count: Int? = null,
    val types: List<String>? = null,
    val mode: String? = null,
)

@Serializable
data class IdDto(val id: String)

@Serializable
data class AskRequest(val question: String, val threadId: String? = null, val context: AskContext = AskContext())

@Serializable
data class AskContext(val courseId: String? = null, val lessonId: String? = null, val documentIds: List<String>? = null)

@Serializable
data class SourceRefDto(val title: String, val page: Int? = null, val documentId: String? = null)

@Serializable
data class CitationsDto(val refs: List<SourceRefDto> = emptyList(), val generalKnowledgeUsed: Boolean = false, val uncertainty: String = "")

@Serializable
data class ChatMessageDto(val id: String, val role: String, val content: String, val grounded: Boolean = false, val citations: JsonElement? = null)

@Serializable
data class AskResponse(val threadId: String, val message: ChatMessageDto)

@Serializable
data class PlanRequest(val courseIds: List<String>? = null, val preview: Boolean = true)

@Serializable
data class PlanSummary(val sessionCount: Int, val totalMinutes: Double, val missedSessions: Int, val note: String? = null)

@Serializable
data class PlanResponse(val preview: Boolean, val summary: PlanSummary)

@Serializable
data class OverviewDto(val courses: Int, val lessons: Counts, val quizzes: QuizStats, val flashcards: CardStats, val sessions: SessionStats) {
    @Serializable data class Counts(val total: Int, val completed: Int)
    @Serializable data class QuizStats(val attemptsLast30Days: Int, val averageLast30Days: Int? = null)
    @Serializable data class CardStats(val total: Int, val mastered: Int, val reviewsLast7Days: Int)
    @Serializable data class SessionStats(val plannedLast30Days: Int, val completedLast30Days: Int)
}

@Serializable
data class ConsentRequest(val granted: Boolean)
