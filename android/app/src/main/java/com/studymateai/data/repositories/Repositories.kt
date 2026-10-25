package com.studymateai.data.repositories

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.studymateai.core.database.AppDatabase
import com.studymateai.core.database.CourseEntity
import com.studymateai.core.database.DocumentEntity
import com.studymateai.core.database.FlashcardEntity
import com.studymateai.core.database.FolderEntity
import com.studymateai.core.database.LessonEntity
import com.studymateai.core.database.LocalQuizResultEntity
import com.studymateai.core.database.NoteEntity
import com.studymateai.core.network.ApiException
import com.studymateai.core.network.AskContext
import com.studymateai.core.network.AskRequest
import com.studymateai.core.network.ConsentRequest
import com.studymateai.core.network.DownloadUrlRequest
import com.studymateai.core.network.GenerateRequest
import com.studymateai.core.network.LoginRequest
import com.studymateai.core.network.NetworkModule
import com.studymateai.core.network.PasteTextRequest
import com.studymateai.core.network.PlanRequest
import com.studymateai.core.network.RefreshRequest
import com.studymateai.core.network.RegisterRequest
import com.studymateai.core.network.UploadUrlRequest
import com.studymateai.core.network.UserDto
import com.studymateai.core.security.TokenStore
import com.studymateai.data.local.Preferences
import com.studymateai.data.synchronization.SyncRepository
import com.studymateai.data.synchronization.SyncWorker
import com.studymateai.domain.Srs
import com.studymateai.domain.SrsState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.time.Instant
import java.util.TimeZone
import java.util.UUID

class AuthRepository(
    private val context: Context,
    private val network: NetworkModule,
    private val tokens: TokenStore,
    private val db: AppDatabase,
    private val prefs: Preferences,
) {
    val isLoggedIn get() = tokens.isLoggedIn

    suspend fun login(email: String, password: String): UserDto {
        val s = network.api.login(LoginRequest(email.trim().lowercase(), password)).data
        tokens.save(s.accessToken, s.refreshToken)
        prefs.setUser(s.user.name, s.user.email)
        SyncWorker.schedulePeriodic(context)
        return s.user
    }

    suspend fun register(name: String, email: String, password: String): UserDto {
        val s = network.api.register(RegisterRequest(name.trim(), email.trim().lowercase(), password, "fr", TimeZone.getDefault().id)).data
        tokens.save(s.accessToken, s.refreshToken)
        prefs.setUser(s.user.name, s.user.email)
        SyncWorker.schedulePeriodic(context)
        return s.user
    }

    /** Déconnexion : révocation côté serveur, puis effacement des données locales et fichiers téléchargés. */
    suspend fun logout() {
        tokens.refreshToken?.let { runCatching { network.api.logout(RefreshRequest(it)) } }
        tokens.clear()
        SyncWorker.cancelAll(context)
        withContext(Dispatchers.IO) {
            db.clearAllTables()
            File(context.filesDir, "documents").deleteRecursively()
        }
        prefs.clear()
    }

    suspend fun setAiConsent(granted: Boolean) = network.api.aiConsent(ConsentRequest(granted)).data
}

/** Données académiques : lecture depuis Room (hors ligne), écritures locales + file de synchronisation. */
class StudyRepository(private val context: Context, private val db: AppDatabase, private val sync: SyncRepository, private val network: NetworkModule) {
    fun courses() = db.courses().observeActive()
    fun course(id: String) = db.courses().observe(id)
    fun folders(courseId: String) = db.folders().observeByCourse(courseId)
    fun folder(id: String) = db.folders().observe(id)
    fun lessons(courseId: String) = db.lessons().observeByCourse(courseId)
    fun lesson(id: String) = db.lessons().observe(id)
    fun notes(courseId: String? = null, lessonId: String? = null) = db.notes().observe(courseId, lessonId)
    fun documents(courseId: String? = null) = db.documents().observe(courseId)
    fun decks() = db.flashcards().observeDecks()
    fun deckCounts() = db.flashcards().observeCounts(System.currentTimeMillis())
    fun quizzes() = db.quizzes().observeAll()
    fun sessionsFrom(from: Instant) = db.planning().observeSessionsFrom(from.toString())
    fun goals() = db.planning().observeGoals()
    fun pendingCount() = db.pending().observeCount()

    private fun changed() = SyncWorker.requestSoon(context)

    suspend fun createCourse(title: String, code: String?): String {
        val id = UUID.randomUUID().toString()
        db.courses().upsert(listOf(CourseEntity(id, title, code, null, null, null, isDemo = false, archived = false, serverUpdatedAt = null)))
        sync.enqueue("course", "create", id, buildJsonObject { put("title", title); code?.let { put("code", it) } })
        changed()
        return id
    }

    suspend fun createFolder(courseId: String, parentId: String?, name: String) {
        val id = UUID.randomUUID().toString()
        db.folders().upsert(listOf(FolderEntity(id, courseId, parentId, name, Int.MAX_VALUE, null)))
        sync.enqueue("folder", "create", id, buildJsonObject { put("courseId", courseId); put("name", name); parentId?.let { put("parentFolderId", it) } })
        changed()
    }

    suspend fun createLesson(courseId: String, folderId: String?, title: String): String {
        val id = UUID.randomUUID().toString()
        db.lessons().upsert(listOf(LessonEntity(id, courseId, folderId, title, null, "", "", "NOT_STARTED", Int.MAX_VALUE, null, null)))
        sync.enqueue("lesson", "create", id, buildJsonObject { put("courseId", courseId); put("title", title); folderId?.let { put("folderId", it) } })
        changed()
        return id
    }

    suspend fun setLessonCompleted(lesson: LessonEntity, completed: Boolean) {
        val status = if (completed) "COMPLETED" else "IN_PROGRESS"
        db.lessons().upsert(listOf(lesson.copy(status = status)))
        sync.enqueue("lesson", "update", lesson.id, buildJsonObject { put("status", status) }, lesson.serverUpdatedAt)
        changed()
    }

    suspend fun note(id: String) = db.notes().get(id)

    /** Enregistre localement ; la version serveur connue sert de base pour détecter un conflit. */
    suspend fun saveNote(id: String?, title: String, content: String, courseId: String?, lessonId: String?): String {
        val existing = id?.let { db.notes().get(it) }
        val noteId = existing?.id ?: UUID.randomUUID().toString()
        db.notes().upsert(
            listOf(
                NoteEntity(noteId, title, content, existing?.courseId ?: courseId, existing?.folderId, existing?.lessonId ?: lessonId, existing?.documentId, existing?.serverUpdatedAt, System.currentTimeMillis(), dirty = true),
            ),
        )
        // Note créée hors ligne : l'opération « create » est déjà en file ; les mises à jour suivantes s'y ajoutent dans l'ordre.
        if (existing == null) {
            sync.enqueue("note", "create", noteId, buildJsonObject { put("title", title); put("content", content); courseId?.let { put("courseId", it) }; lessonId?.let { put("lessonId", it) } })
        } else {
            sync.enqueue("note", "update", noteId, buildJsonObject { put("title", title); put("content", content) }, existing.serverUpdatedAt)
        }
        changed()
        return noteId
    }

    suspend fun deleteNote(id: String) {
        val n = db.notes().get(id) ?: return
        db.notes().delete(id)
        if (n.serverUpdatedAt != null) sync.enqueue("note", "delete", id, buildJsonObject { })
        changed()
    }

    suspend fun dueCards(deckId: String?): List<FlashcardEntity> = db.flashcards().due(deckId, System.currentTimeMillis())

    /** Révision hors ligne : planification locale (même algorithme que le serveur) + opération en file. */
    suspend fun reviewCard(card: FlashcardEntity, rating: Int) {
        val now = System.currentTimeMillis()
        val r = Srs.schedule(SrsState(card.easeFactor, card.intervalDays, card.repetitions, card.lapses), rating, now)
        db.flashcards().upsertCards(listOf(card.copy(easeFactor = r.state.easeFactor, intervalDays = r.state.intervalDays, repetitions = r.state.repetitions, lapses = r.state.lapses, dueAt = r.dueAtMillis)))
        sync.enqueue("flashcard_review", "create", UUID.randomUUID().toString(), buildJsonObject { put("flashcardId", card.id); put("rating", rating) })
        changed()
    }

    suspend fun setSessionStatus(id: String, status: String) {
        db.planning().setSessionStatus(id, status)
        sync.enqueue("session", "update", id, buildJsonObject { put("status", status) })
        changed()
    }

    suspend fun quiz(id: String) = db.quizzes().get(id)
    suspend fun saveLocalQuizResult(quizId: String, score: Double, max: Double) = db.quizzes().saveResult(LocalQuizResultEntity(quizId = quizId, score = score, maxScore = max, completedAt = System.currentTimeMillis()))
}

/** Documents : téléchargement pour la lecture hors ligne, texte extrait, import de scans. */
class DocumentRepository(private val context: Context, private val db: AppDatabase, private val network: NetworkModule, private val prefs: Preferences) {
    fun observe(id: String) = db.documents().observeOne(id)
    fun downloaded() = db.documents().observeDownloaded()

    private fun onUnmeteredNetwork(): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    suspend fun download(doc: DocumentEntity, force: Boolean = false): File = withContext(Dispatchers.IO) {
        if (!force && prefs.isWifiOnly() && !onUnmeteredNetwork()) {
            throw ApiException(0, "WIFI_ONLY", "Téléchargement réservé au Wi-Fi (modifiable dans Profil). Taille : ${doc.fileSize / 1024} Ko.")
        }
        val link = network.api.downloadUrl(doc.id, DownloadUrlRequest(inline = false)).data
        val dir = File(context.filesDir, "documents").apply { mkdirs() }
        val ext = doc.fileName.substringAfterLast('.', "bin")
        val target = File(dir, "${doc.id}.$ext")
        val tmp = File(dir, "${doc.id}.part")
        network.plainClient.newCall(Request.Builder().url(network.absolute(link.url)).build()).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "DOWNLOAD_FAILED", "Téléchargement impossible (${res.code}).")
            tmp.outputStream().use { out -> res.body!!.byteStream().copyTo(out) }
        }
        tmp.renameTo(target)
        db.documents().setLocalPath(doc.id, target.absolutePath)
        // Le texte extrait est aussi mis en cache pour la lecture hors ligne.
        runCatching { cacheText(doc.id) }
        target
    }

    suspend fun removeDownload(doc: DocumentEntity) = withContext(Dispatchers.IO) {
        doc.localPath?.let { File(it).delete() }
        db.documents().setLocalPath(doc.id, null)
    }

    suspend fun cacheText(id: String): String {
        val ex = network.api.documentText(id).data
        val text = ex.pages.joinToString("\n\n") { p -> (p.page?.let { "— Page $it —\n" } ?: "") + p.text }
        db.documents().setCachedText(id, text)
        return text
    }

    /**
     * Ajout d'un PDF à la base de connaissances d'un dossier (fichier choisi ou scan assemblé
     * sur l'appareil) : URL signée → envoi → confirmation → extraction / OCR côté serveur.
     */
    suspend fun uploadPdf(file: File, fileName: String, courseId: String, folderId: String?, source: String = "file"): String = withContext(Dispatchers.IO) {
        val auth = network.api.uploadUrl(UploadUrlRequest(fileName, "application/pdf", file.length(), courseId = courseId, folderId = folderId, source = source)).data
        val req = Request.Builder().url(network.absolute(auth.upload.url)).put(file.asRequestBody("application/pdf".toMediaType())).build()
        network.client.newCall(req).execute().use { if (!it.isSuccessful) throw ApiException(it.code, "UPLOAD_FAILED", "L'envoi du scan a échoué (${it.code}).") }
        val doc = network.api.confirmUpload(auth.document.id).data
        saveLocal(doc)
        doc.id
    }

    /** Troisième mode d'ajout : texte copié-collé. */
    suspend fun pasteText(title: String, content: String, courseId: String, folderId: String?): String {
        val doc = network.api.pasteText(PasteTextRequest(title, content, courseId, folderId)).data
        saveLocal(doc)
        return doc.id
    }

    suspend fun knowledgeBase(courseId: String) = network.api.knowledgeBase(courseId).data

    private suspend fun saveLocal(doc: com.studymateai.core.network.DocumentDto) {
        db.documents().upsert(listOf(DocumentEntity(doc.id, doc.fileName, doc.mimeType, doc.fileSize, doc.courseId, doc.folderId, doc.source, doc.processingStatus, null, null, null, null, doc.updatedAt)))
    }
}

/** Fonctions nécessitant une connexion : IA, programme, statistiques. */
class OnlineRepository(private val network: NetworkModule) {
    suspend fun aiStatus() = network.api.aiStatus().data
    /** Fiches de révision (résumé structuré) à partir de la base de connaissances. */
    suspend fun summary(courseId: String?, folderId: String?, lessonId: String?) = network.api.generateSummary(GenerateRequest(courseId = courseId, folderId = folderId, lessonId = lessonId, length = "standard")).data.id
    suspend fun flashcards(courseId: String?, folderId: String?, lessonId: String?) = network.api.generateFlashcards(GenerateRequest(courseId = courseId, folderId = folderId, lessonId = lessonId, count = 12)).data.id
    /** Questionnaire à choix multiple (choix unique + choix multiples), mode entraînement. */
    suspend fun qcm(courseId: String?, folderId: String?, lessonId: String?) = network.api.generateQuiz(GenerateRequest(courseId = courseId, folderId = folderId, lessonId = lessonId, count = 10, types = listOf("SINGLE_CHOICE", "MULTIPLE_CHOICE"), mode = "practice")).data.id
    suspend fun ask(question: String, threadId: String?, courseId: String?, lessonId: String?) = network.api.ask(AskRequest(question, threadId, AskContext(courseId = courseId, lessonId = lessonId))).data
    suspend fun plan(accept: Boolean) = network.api.generatePlan(PlanRequest(preview = !accept)).data
    suspend fun overview() = network.api.overview().data
}
