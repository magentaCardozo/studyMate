package com.studymateai.core.network

import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Client REST — mêmes routes /api/v1 que le client web. */
interface StudyMateApi {
    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): Envelope<SessionDto>

    @POST("api/v1/auth/register")
    suspend fun register(@Body body: RegisterRequest): Envelope<SessionDto>

    @POST("api/v1/auth/logout")
    suspend fun logout(@Body body: RefreshRequest)

    @GET("api/v1/users/me")
    suspend fun me(): Envelope<UserDto>

    @POST("api/v1/users/me/ai-consent")
    suspend fun aiConsent(@Body body: ConsentRequest): Envelope<UserDto>

    @POST("api/v1/courses")
    suspend fun createCourse(@Body body: CreateCourseRequest): Envelope<CourseDto>

    @GET("api/v1/sync/changes")
    suspend fun changes(@Query("since") since: String?): Envelope<ChangesDto>

    @POST("api/v1/sync/push")
    suspend fun push(@Body body: PushRequest): Envelope<PushResponse>

    @POST("api/v1/documents/upload-url")
    suspend fun uploadUrl(@Body body: UploadUrlRequest): Envelope<UploadUrlResponse>

    @POST("api/v1/documents/text")
    suspend fun pasteText(@Body body: PasteTextRequest): Envelope<DocumentDto>

    @GET("api/v1/courses/{id}/knowledge-base")
    suspend fun knowledgeBase(@Path("id") id: String): Envelope<KnowledgeBaseDto>

    @GET("api/v1/courses/{id}/knowledge-base/content")
    suspend fun knowledgeBaseContent(@Path("id") id: String): Envelope<KbContentDto>

    @POST("api/v1/documents/{id}/confirm-upload")
    suspend fun confirmUpload(@Path("id") id: String): Envelope<DocumentDto>

    @POST("api/v1/documents/{id}/download-url")
    suspend fun downloadUrl(@Path("id") id: String, @Body body: DownloadUrlRequest): Envelope<DownloadUrlResponse>

    @GET("api/v1/documents/{id}/text")
    suspend fun documentText(@Path("id") id: String): Envelope<ExtractionDto>

    @GET("api/v1/ai/status")
    suspend fun aiStatus(): Envelope<AiStatusDto>

    @POST("api/v1/ai/summaries")
    suspend fun generateSummary(@Body body: GenerateRequest): Envelope<IdDto>

    @POST("api/v1/ai/flashcards")
    suspend fun generateFlashcards(@Body body: GenerateRequest): Envelope<IdDto>

    @POST("api/v1/ai/quizzes")
    suspend fun generateQuiz(@Body body: GenerateRequest): Envelope<IdDto>

    @POST("api/v1/ai/ask")
    suspend fun ask(@Body body: AskRequest): Envelope<AskResponse>

    @GET("api/v1/courses/{id}/revisions")
    suspend fun revisions(@Path("id") id: String): Envelope<CourseRevisionsDto>

    @GET("api/v1/review")
    suspend fun review(): Envelope<ReviewDto>

    @POST("api/v1/review/mistakes-quiz")
    suspend fun mistakesQuiz(@Body body: MistakesQuizRequest): Envelope<IdDto>

    @GET("api/v1/summaries/{id}")
    suspend fun summary(@Path("id") id: String): Envelope<JsonElement>

    @POST("api/v1/study-plans/generate")
    suspend fun generatePlan(@Body body: PlanRequest): Envelope<PlanResponse>

    @GET("api/v1/progress/overview")
    suspend fun overview(): Envelope<OverviewDto>
}
