package com.studymateai.core.network

import com.studymateai.BuildConfig
import com.studymateai.core.security.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    coerceInputValues = true
}

/** Erreur API lisible par l'utilisateur. */
class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

fun Throwable.toUserMessage(): String = when (this) {
    is ApiException -> message
    is HttpException -> runCatching { AppJson.decodeFromString<ErrorBody>(response()?.errorBody()?.string().orEmpty()).error.message }.getOrNull()
        ?: "Erreur du serveur (${code()})."
    is IOException -> "Connexion impossible. Vérifiez votre accès à Internet."
    else -> message ?: "Une erreur inattendue est survenue."
}

fun Throwable.isNetwork(): Boolean = this is IOException

class NetworkModule(private val tokens: TokenStore, private val onSessionExpired: () -> Unit) {
    val baseUrl: String = BuildConfig.API_BASE_URL

    private val authInterceptor = Interceptor { chain ->
        val builder = chain.request().newBuilder().header("X-Client", "android")
        tokens.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        chain.proceed(builder.build())
    }

    /** Rafraîchit le jeton d'accès sur un 401, avec rotation du jeton de rafraîchissement. */
    private val authenticator = object : Authenticator {
        override fun authenticate(route: Route?, response: Response): Request? {
            if (response.request.url.encodedPath.contains("/auth/")) return null
            if (responseCount(response) >= 2) return null
            synchronized(this) {
                val current = tokens.accessToken
                val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
                // Un autre appel a déjà rafraîchi la session.
                if (current != null && current != sent) return response.request.newBuilder().header("Authorization", "Bearer $current").build()
                val refresh = tokens.refreshToken ?: return null
                val body = AppJson.encodeToString(RefreshRequest.serializer(), RefreshRequest(refresh)).toRequestBody(JSON)
                val req = Request.Builder().url(baseUrl + "api/v1/auth/refresh").post(body).header("X-Client", "android").build()
                val res = runCatching { plainClient.newCall(req).execute() }.getOrNull() ?: return null
                res.use {
                    if (!it.isSuccessful) {
                        if (it.code == 401) {
                            tokens.clear()
                            onSessionExpired()
                        }
                        return null
                    }
                    val session = AppJson.decodeFromString(Envelope.serializer(SessionDto.serializer()), it.body!!.string()).data
                    tokens.save(session.accessToken, session.refreshToken)
                    return response.request.newBuilder().header("Authorization", "Bearer ${session.accessToken}").build()
                }
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var r: Response? = response
        var n = 1
        while (r?.priorResponse != null) {
            n++
            r = r.priorResponse
        }
        return n
    }

    private val logging = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        redactHeader("Authorization")
    }

    val plainClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    val client: OkHttpClient = plainClient.newBuilder()
        .addInterceptor(authInterceptor)
        .authenticator(authenticator)
        .addInterceptor(logging)
        .build()

    val api: StudyMateApi = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(AppJson.asConverterFactory(JSON))
        .build()
        .create(StudyMateApi::class.java)

    /** Résout une URL relative renvoyée par l'API (URL signée d'import ou de téléchargement). */
    fun absolute(path: String): String = if (path.startsWith("http")) path else baseUrl.trimEnd('/') + path

    companion object {
        val JSON = "application/json".toMediaType()
    }
}
