package com.studymateai.core.database

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Dao
interface CourseDao {
    @Query("SELECT * FROM courses WHERE archived = 0 ORDER BY title COLLATE NOCASE")
    fun observeActive(): Flow<List<CourseEntity>>

    @Query("SELECT * FROM courses WHERE id = :id")
    fun observe(id: String): Flow<CourseEntity?>

    @Upsert suspend fun upsert(items: List<CourseEntity>)
    @Query("DELETE FROM courses WHERE id = :id") suspend fun delete(id: String)
    @Query("SELECT COUNT(*) FROM lessons WHERE courseId = :courseId") suspend fun lessonCount(courseId: String): Int
}

@Dao
interface FolderDao {
    @Query("SELECT * FROM folders WHERE courseId = :courseId ORDER BY sortOrder, name")
    fun observeByCourse(courseId: String): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders WHERE id = :id")
    fun observe(id: String): Flow<FolderEntity?>

    @Upsert suspend fun upsert(items: List<FolderEntity>)
    @Query("DELETE FROM folders WHERE id = :id") suspend fun delete(id: String)
}

@Dao
interface LessonDao {
    @Query("SELECT * FROM lessons WHERE courseId = :courseId ORDER BY sortOrder, title")
    fun observeByCourse(courseId: String): Flow<List<LessonEntity>>

    @Query("SELECT * FROM lessons WHERE id = :id")
    fun observe(id: String): Flow<LessonEntity?>

    @Query("SELECT * FROM lessons WHERE id = :id") suspend fun get(id: String): LessonEntity?
    @Upsert suspend fun upsert(items: List<LessonEntity>)
    @Query("DELETE FROM lessons WHERE id = :id") suspend fun delete(id: String)
}

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes WHERE (:courseId IS NULL OR courseId = :courseId) AND (:lessonId IS NULL OR lessonId = :lessonId) ORDER BY localUpdatedAt DESC")
    fun observe(courseId: String?, lessonId: String?): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id") suspend fun get(id: String): NoteEntity?
    @Upsert suspend fun upsert(items: List<NoteEntity>)
    @Query("DELETE FROM notes WHERE id = :id") suspend fun delete(id: String)
}

@Dao
interface DocumentDao {
    @Query("SELECT * FROM documents WHERE (:courseId IS NULL OR courseId = :courseId) ORDER BY fileName COLLATE NOCASE")
    fun observe(courseId: String?): Flow<List<DocumentEntity>>

    @Query("SELECT * FROM documents WHERE localPath IS NOT NULL ORDER BY fileName COLLATE NOCASE")
    fun observeDownloaded(): Flow<List<DocumentEntity>>

    @Query("SELECT * FROM documents WHERE id = :id") fun observeOne(id: String): Flow<DocumentEntity?>
    @Query("SELECT * FROM documents WHERE id = :id") suspend fun get(id: String): DocumentEntity?
    @Upsert suspend fun upsert(items: List<DocumentEntity>)
    @Query("UPDATE documents SET localPath = :path WHERE id = :id") suspend fun setLocalPath(id: String, path: String?)
    @Query("UPDATE documents SET cachedText = :text WHERE id = :id") suspend fun setCachedText(id: String, text: String?)
    @Query("DELETE FROM documents WHERE id = :id") suspend fun delete(id: String)
}

@Dao
interface FlashcardDao {
    @Query("SELECT * FROM decks ORDER BY title COLLATE NOCASE") fun observeDecks(): Flow<List<DeckEntity>>
    @Query("SELECT * FROM flashcards WHERE (:deckId IS NULL OR deckId = :deckId) AND dueAt <= :now ORDER BY dueAt LIMIT :limit")
    suspend fun due(deckId: String?, now: Long, limit: Int = 100): List<FlashcardEntity>
    @Query("SELECT deckId AS deckId, COUNT(*) AS total, SUM(CASE WHEN dueAt <= :now THEN 1 ELSE 0 END) AS due FROM flashcards GROUP BY deckId")
    fun observeCounts(now: Long): Flow<List<DeckCount>>
    @Upsert suspend fun upsertDecks(items: List<DeckEntity>)
    @Upsert suspend fun upsertCards(items: List<FlashcardEntity>)
    @Query("DELETE FROM decks WHERE id = :id") suspend fun deleteDeck(id: String)
    @Query("DELETE FROM flashcards WHERE id = :id") suspend fun deleteCard(id: String)
}

data class DeckCount(val deckId: String, val total: Int, val due: Int)

@Dao
interface QuizDao {
    @Query("SELECT * FROM quizzes ORDER BY createdAt DESC") fun observeAll(): Flow<List<QuizEntity>>
    @Query("SELECT * FROM quizzes WHERE id = :id") suspend fun get(id: String): QuizEntity?
    @Upsert suspend fun upsert(items: List<QuizEntity>)
    @Query("DELETE FROM quizzes WHERE id = :id") suspend fun delete(id: String)
    @Upsert suspend fun saveResult(result: LocalQuizResultEntity)
}

@Dao
interface PlanningDao {
    @Query("SELECT * FROM sessions WHERE scheduledStart >= :from ORDER BY scheduledStart LIMIT 200")
    fun observeSessionsFrom(from: String): Flow<List<SessionEntity>>
    @Query("SELECT * FROM goals WHERE status = 'active' ORDER BY targetDate") fun observeGoals(): Flow<List<GoalEntity>>
    @Upsert suspend fun upsertSessions(items: List<SessionEntity>)
    @Upsert suspend fun upsertGoals(items: List<GoalEntity>)
    @Query("UPDATE sessions SET status = :status WHERE id = :id") suspend fun setSessionStatus(id: String, status: String)
    @Query("DELETE FROM sessions WHERE id = :id") suspend fun deleteSession(id: String)
    @Query("DELETE FROM goals WHERE id = :id") suspend fun deleteGoal(id: String)
}

@Dao
interface PendingDao {
    @Query("SELECT * FROM pending_operations ORDER BY createdAt LIMIT :limit") suspend fun next(limit: Int = 200): List<PendingOperationEntity>
    @Query("SELECT COUNT(*) FROM pending_operations") fun observeCount(): Flow<Int>
    @Upsert suspend fun upsert(op: PendingOperationEntity)
    @Query("DELETE FROM pending_operations WHERE opId = :opId") suspend fun delete(opId: String)
    @Query("SELECT * FROM pending_operations WHERE opId = :opId") suspend fun get(opId: String): PendingOperationEntity?
    @Query("SELECT COUNT(*) FROM pending_operations WHERE entityId = :entityId") suspend fun countFor(entityId: String): Int
    @Query("SELECT * FROM pending_operations WHERE entity = :entity AND entityId = :entityId AND action = :action AND attempts = 0 LIMIT 1")
    suspend fun find(entity: String, entityId: String, action: String): PendingOperationEntity?
}

@Database(
    entities = [
        CourseEntity::class, FolderEntity::class, LessonEntity::class, NoteEntity::class, DocumentEntity::class,
        DeckEntity::class, FlashcardEntity::class, QuizEntity::class, GoalEntity::class, SessionEntity::class,
        PendingOperationEntity::class, LocalQuizResultEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun courses(): CourseDao
    abstract fun folders(): FolderDao
    abstract fun lessons(): LessonDao
    abstract fun notes(): NoteDao
    abstract fun documents(): DocumentDao
    abstract fun flashcards(): FlashcardDao
    abstract fun quizzes(): QuizDao
    abstract fun planning(): PlanningDao
    abstract fun pending(): PendingDao

    companion object {
        /**
         * v2 : base de connaissances par dossier — le document n'est plus rattaché à une leçon
         * et porte son mode d'ajout (fichier, scan, texte collé). Migration sans perte de données
         * (la file des modifications hors ligne est conservée).
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE documents_new (id TEXT NOT NULL PRIMARY KEY, fileName TEXT NOT NULL, mimeType TEXT NOT NULL, fileSize INTEGER NOT NULL, " +
                        "courseId TEXT, folderId TEXT, source TEXT NOT NULL, processingStatus TEXT NOT NULL, processingError TEXT, pageCount INTEGER, " +
                        "localPath TEXT, cachedText TEXT, serverUpdatedAt TEXT)",
                )
                db.execSQL(
                    "INSERT INTO documents_new (id, fileName, mimeType, fileSize, courseId, folderId, source, processingStatus, processingError, pageCount, localPath, cachedText, serverUpdatedAt) " +
                        "SELECT id, fileName, mimeType, fileSize, courseId, folderId, 'file', processingStatus, processingError, pageCount, localPath, cachedText, serverUpdatedAt FROM documents",
                )
                db.execSQL("DROP TABLE documents")
                db.execSQL("ALTER TABLE documents_new RENAME TO documents")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_documents_courseId ON documents (courseId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_documents_folderId ON documents (folderId)")
            }
        }

        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "studymate.db").addMigrations(MIGRATION_1_2).build()
    }
}
