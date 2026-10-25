package com.studymateai.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Copie locale (Room) des données synchronisées. `serverUpdatedAt` est la version
 * serveur connue : elle sert de version de base pour détecter les conflits.
 */

@Entity(tableName = "courses")
data class CourseEntity(
    @PrimaryKey val id: String,
    val title: String,
    val code: String?,
    val description: String?,
    val color: String?,
    val semesterName: String?,
    val isDemo: Boolean,
    val archived: Boolean,
    val serverUpdatedAt: String?,
)

@Entity(tableName = "folders", indices = [Index("courseId")])
data class FolderEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val parentFolderId: String?,
    val name: String,
    val sortOrder: Int,
    val serverUpdatedAt: String?,
)

@Entity(tableName = "lessons", indices = [Index("courseId"), Index("folderId")])
data class LessonEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val folderId: String?,
    val title: String,
    val description: String?,
    val content: String,
    val objectives: String,
    val status: String,
    val sortOrder: Int,
    val estimatedMinutes: Int?,
    val serverUpdatedAt: String?,
)

@Entity(tableName = "notes", indices = [Index("courseId"), Index("lessonId")])
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val content: String,
    val courseId: String?,
    val folderId: String?,
    val lessonId: String?,
    val documentId: String?,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val dirty: Boolean,
)

/** Document de la base de connaissances d'un dossier (courseId), éventuellement d'un sous-dossier. */
@Entity(tableName = "documents", indices = [Index("courseId"), Index("folderId")])
data class DocumentEntity(
    @PrimaryKey val id: String,
    val fileName: String,
    val mimeType: String,
    val fileSize: Long,
    val courseId: String?,
    val folderId: String?,
    /** file | scan | text */
    val source: String,
    val processingStatus: String,
    val processingError: String?,
    val pageCount: Int?,
    /** Chemin du fichier téléchargé pour la lecture hors ligne. */
    val localPath: String?,
    /** Texte extrait mis en cache (lecture hors ligne). */
    val cachedText: String?,
    val serverUpdatedAt: String?,
)

@Entity(tableName = "decks")
data class DeckEntity(
    @PrimaryKey val id: String,
    val title: String,
    val courseId: String?,
    val lessonId: String?,
    val origin: String,
)

@Entity(tableName = "flashcards", indices = [Index("deckId"), Index("dueAt")])
data class FlashcardEntity(
    @PrimaryKey val id: String,
    val deckId: String,
    val question: String,
    val answer: String,
    val easeFactor: Double,
    val intervalDays: Double,
    val repetitions: Int,
    val lapses: Int,
    /** Epoch millis — recalculé localement lors des révisions hors ligne. */
    val dueAt: Long,
    val serverUpdatedAt: String?,
)

@Entity(tableName = "quizzes")
data class QuizEntity(
    @PrimaryKey val id: String,
    val title: String,
    val courseId: String?,
    val mode: String,
    val offlineEligible: Boolean,
    /** Questions au format JSON (contrat API) — corrections absentes pour les quiz d'examen. */
    val questionsJson: String,
    val createdAt: String,
)

@Entity(tableName = "goals")
data class GoalEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val title: String,
    val courseId: String?,
    val targetDate: String?,
    val status: String,
)

@Entity(tableName = "sessions", indices = [Index("scheduledStart")])
data class SessionEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val lessonId: String?,
    val scheduledStart: String,
    val scheduledEnd: String,
    val activityType: String,
    val objective: String?,
    val reason: String?,
    val status: String,
)

/** File des modifications locales en attente d'envoi (idempotentes grâce à opId). */
@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val opId: String,
    val entity: String,
    val action: String,
    val entityId: String,
    val payloadJson: String,
    val baseUpdatedAt: String?,
    val clientTime: String,
    val createdAt: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
)

@Entity(tableName = "local_quiz_results")
data class LocalQuizResultEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val quizId: String,
    val score: Double,
    val maxScore: Double,
    val completedAt: Long,
)
