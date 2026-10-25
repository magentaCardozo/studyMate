package com.studymateai.data.synchronization

import com.studymateai.core.database.AppDatabase
import com.studymateai.core.database.CourseEntity
import com.studymateai.core.database.DeckEntity
import com.studymateai.core.database.DocumentEntity
import com.studymateai.core.database.FlashcardEntity
import com.studymateai.core.database.FolderEntity
import com.studymateai.core.database.GoalEntity
import com.studymateai.core.database.LessonEntity
import com.studymateai.core.database.NoteEntity
import com.studymateai.core.database.PendingOperationEntity
import com.studymateai.core.database.QuizEntity
import com.studymateai.core.database.SessionEntity
import com.studymateai.core.network.AppJson
import com.studymateai.core.network.ChangesDto
import com.studymateai.core.network.NoteDto
import com.studymateai.core.network.PushRequest
import com.studymateai.core.network.QuestionDto
import com.studymateai.core.network.StudyMateApi
import com.studymateai.core.network.SyncOperationDto
import com.studymateai.data.local.Preferences
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * Synchronisation hors ligne :
 *  1. envoi des opérations locales en attente (idempotentes : opId) ;
 *  2. récupération des changements serveur depuis le dernier curseur, suppressions comprises.
 * Résolution des conflits (définie côté serveur, voir docs/offline-sync.md) :
 *  - note modifiée des deux côtés → version serveur conservée, version locale enregistrée en copie « (conflit) » ;
 *  - autres ressources → la version serveur l'emporte ; l'étudiant est informé.
 */
class SyncRepository(private val api: StudyMateApi, private val db: AppDatabase, private val prefs: Preferences) {
    private val mutex = Mutex()

    /**
     * Ajoute une opération à la file. Les mises à jour successives d'une même ressource sont
     * fusionnées (dans l'opération « create » encore en attente, ou dans la mise à jour précédente
     * en conservant sa version de base) : la sauvegarde automatique ne crée pas de faux conflits.
     */
    suspend fun enqueue(entity: String, action: String, entityId: String, data: JsonObject, baseUpdatedAt: String? = null) {
        if (action == "update") {
            val target = db.pending().find(entity, entityId, "create") ?: db.pending().find(entity, entityId, "update")
            if (target != null) {
                val merged = JsonObject((AppJson.parseToJsonElement(target.payloadJson) as JsonObject) + data)
                db.pending().upsert(target.copy(payloadJson = merged.toString(), clientTime = Instant.now().toString()))
                return
            }
        }
        db.pending().upsert(
            PendingOperationEntity(
                opId = UUID.randomUUID().toString(),
                entity = entity,
                action = action,
                entityId = entityId,
                payloadJson = data.toString(),
                baseUpdatedAt = baseUpdatedAt,
                clientTime = Instant.now().toString(),
                createdAt = System.currentTimeMillis() * 1000 + (seq++ % 1000),
            ),
        )
    }

    private var seq = 0L

    /** Exécute une synchronisation complète. Lève une exception réseau si hors ligne. */
    suspend fun sync(): SyncReport = mutex.withLock {
        val pushed = push()
        val pulled = pull()
        prefs.syncSucceeded(pulled.serverTime)
        SyncReport(pushed.applied, pushed.conflicts, pushed.failed, pulled.changes)
    }

    private data class PushOutcome(val applied: Int, val conflicts: List<String>, val failed: Int)

    private suspend fun push(): PushOutcome {
        var applied = 0
        var failed = 0
        val conflicts = mutableListOf<String>()
        while (true) {
            val batch = db.pending().next(100).filter { it.attempts < MAX_ATTEMPTS }
            if (batch.isEmpty()) break
            val response = api.push(
                PushRequest(batch.map { SyncOperationDto(it.opId, it.entity, it.action, it.entityId, AppJson.parseToJsonElement(it.payloadJson) as JsonObject, it.baseUpdatedAt, it.clientTime) }),
            ).data
            for (result in response.results) {
                val op = batch.first { it.opId == result.opId }
                when (result.status) {
                    "applied", "duplicate" -> {
                        applied++
                        val current = db.pending().get(op.opId)
                        if (current != null && current.payloadJson != op.payloadJson) {
                            // Modifiée pendant l'envoi : le complément devient une mise à jour basée sur la version serveur.
                            val serverVersion = (result.server as? JsonObject)?.get("updatedAt")?.jsonPrimitive?.content
                            db.pending().delete(op.opId)
                            db.pending().upsert(current.copy(opId = UUID.randomUUID().toString(), action = "update", baseUpdatedAt = serverVersion))
                            continue
                        }
                        db.pending().delete(op.opId)
                        if (result.entity == "note" && result.server != null) {
                            runCatching { AppJson.decodeFromJsonElement(NoteDto.serializer(), result.server) }.getOrNull()?.let { saveNote(it) }
                        }
                    }
                    "conflict" -> {
                        db.pending().delete(op.opId)
                        conflicts += result.message ?: "Modification en conflit : la version du serveur a été conservée."
                    }
                    else -> {
                        failed++
                        db.pending().upsert(op.copy(attempts = op.attempts + 1, lastError = result.message))
                    }
                }
            }
            if (batch.size < 100) break
        }
        prefs.setConflict(conflicts.lastOrNull())
        return PushOutcome(applied, conflicts, failed)
    }

    private data class PullOutcome(val serverTime: String, val changes: Int)

    private suspend fun pull(): PullOutcome {
        val c: ChangesDto = api.changes(prefs.lastSyncCursor()).data
        // On n'écrase pas une ressource qui a encore une modification locale en attente.
        suspend fun pendingFor(id: String) = db.pending().countFor(id) > 0

        db.courses().upsert(c.courses.map { CourseEntity(it.id, it.title, it.code, it.description, it.color, it.semester?.name, it.isDemo, it.archivedAt != null, it.updatedAt) })
        db.folders().upsert(c.folders.filter { it.archivedAt == null }.map { FolderEntity(it.id, it.courseId, it.parentFolderId, it.name, it.sortOrder, it.updatedAt) })
        db.lessons().upsert(
            c.lessons.filter { !pendingFor(it.id) }.map {
                LessonEntity(it.id, it.courseId, it.folderId, it.title, it.description, it.content, it.learningObjectives.joinToString("\n"), it.status, it.sortOrder, it.estimatedMinutes, it.updatedAt)
            },
        )
        for (n in c.notes) if (!pendingFor(n.id)) saveNote(n)
        for (d in c.documents) {
            val existing = db.documents().get(d.id)
            db.documents().upsert(
                listOf(
                    DocumentEntity(
                        d.id, d.fileName, d.mimeType, d.fileSize, d.courseId, d.folderId, d.source, d.processingStatus, d.processingError, d.pageCount,
                        localPath = existing?.localPath, cachedText = existing?.cachedText, serverUpdatedAt = d.updatedAt,
                    ),
                ),
            )
        }
        db.flashcards().upsertDecks(c.decks.map { DeckEntity(it.id, it.title, it.courseId, it.lessonId, it.origin) })
        db.flashcards().upsertCards(
            c.flashcards.filter { !pendingFor(it.id) }.map {
                FlashcardEntity(it.id, it.deckId, it.question, it.answer, it.easeFactor, it.intervalDays, it.repetitions, it.lapses, Instant.parse(it.dueAt).toEpochMilli(), it.updatedAt)
            },
        )
        db.quizzes().upsert(
            c.quizzes.map {
                QuizEntity(
                    it.id, it.title, it.courseId, it.configuration?.get("mode")?.jsonPrimitive?.content ?: "practice", it.offlineEligible,
                    AppJson.encodeToString(ListSerializer(QuestionDto.serializer()), it.questions), it.createdAt,
                )
            },
        )
        db.planning().upsertGoals(c.goals.map { GoalEntity(it.id, it.kind, it.title, it.courseId, it.targetDate, it.status) })
        db.planning().upsertSessions(
            c.sessions.filter { !pendingFor(it.id) }.map { SessionEntity(it.id, it.courseId, it.lessonId, it.scheduledStart, it.scheduledEnd, it.activityType, it.objective, it.reason, it.status) },
        )
        for (t in c.tombstones) {
            when (t.entity) {
                "course" -> db.courses().delete(t.entityId)
                "folder" -> db.folders().delete(t.entityId)
                "lesson" -> db.lessons().delete(t.entityId)
                "note" -> db.notes().delete(t.entityId)
                "document" -> db.documents().delete(t.entityId)
                "deck" -> db.flashcards().deleteDeck(t.entityId)
                "flashcard" -> db.flashcards().deleteCard(t.entityId)
                "quiz" -> db.quizzes().delete(t.entityId)
                "session" -> db.planning().deleteSession(t.entityId)
                "goal" -> db.planning().deleteGoal(t.entityId)
            }
        }
        val count = c.courses.size + c.folders.size + c.lessons.size + c.notes.size + c.documents.size + c.flashcards.size + c.sessions.size + c.tombstones.size
        return PullOutcome(c.serverTime, count)
    }

    private suspend fun saveNote(n: NoteDto) {
        db.notes().upsert(listOf(NoteEntity(n.id, n.title, n.content, n.courseId, n.folderId, n.lessonId, n.documentId, n.updatedAt, Instant.parse(n.updatedAt).toEpochMilli(), dirty = false)))
    }

    companion object {
        const val MAX_ATTEMPTS = 5
    }
}

data class SyncReport(val applied: Int, val conflicts: List<String>, val failed: Int, val pulled: Int)
