package com.studymateai.core.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.studymateai.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Contenu de /telecharger/version.json, publié par le déploiement à côté de l'APK. */
@Serializable
data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String = "studymate.apk",
    val sha256: String,
    val size: Long,
    val notes: String? = null,
    val releasedAt: String? = null,
)

class UpdateException(message: String) : Exception(message)

/**
 * Détection et installation des mises à jour de l'application (diffusée hors Play Store).
 * L'APK téléchargé est vérifié (taille et empreinte SHA-256 annoncées) avant d'être confié à
 * l'installateur d'Android, qui vérifie en plus que la signature est celle de l'application installée.
 */
class AppUpdater(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val manifestUrl = URL(BuildConfig.UPDATE_URL)

    private val _available = MutableStateFlow<UpdateInfo?>(null)
    /** Mise à jour plus récente que la version installée, ou null. */
    val available: StateFlow<UpdateInfo?> = _available.asStateFlow()

    /** Version pour laquelle l'utilisateur a répondu « Plus tard » pendant cette session. */
    var postponedVersion: Int? = null

    val currentVersionCode get() = BuildConfig.VERSION_CODE
    val currentVersionName: String get() = BuildConfig.VERSION_NAME

    /** Interroge le serveur ; renvoie la mise à jour disponible (ou null si l'application est à jour). */
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        val conn = (manifestUrl.openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 10_000
            useCaches = false
            setRequestProperty("Cache-Control", "no-cache")
        }
        try {
            if (conn.responseCode == 404) return@withContext null.also { _available.value = null }
            if (conn.responseCode != 200) throw UpdateException("Serveur de mise à jour indisponible (${conn.responseCode}).")
            val info = json.decodeFromString(UpdateInfo.serializer(), conn.inputStream.bufferedReader().readText())
            (info.takeIf { it.versionCode > BuildConfig.VERSION_CODE }).also { _available.value = it }
        } finally {
            conn.disconnect()
        }
    }

    private fun apkFile(info: UpdateInfo) = File(File(context.cacheDir, "updates").apply { mkdirs() }, "studymate-${info.versionCode}.apk")

    /** Télécharge l'APK (progression 0..1) puis vérifie sa taille et son empreinte. */
    suspend fun download(info: UpdateInfo, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val target = apkFile(info)
        if (target.exists() && target.length() == info.size && sha256(target).equals(info.sha256, ignoreCase = true)) return@withContext target
        // Anciennes versions téléchargées : supprimées.
        target.parentFile?.listFiles()?.forEach { it.delete() }
        val url = URL(manifestUrl, info.apkUrl)
        if (url.protocol != "https" && !BuildConfig.DEBUG) throw UpdateException("Téléchargement refusé : connexion non sécurisée.")
        val conn = (url.openConnection() as HttpURLConnection).apply { connectTimeout = 15_000; readTimeout = 30_000 }
        try {
            if (conn.responseCode != 200) throw UpdateException("Téléchargement impossible (${conn.responseCode}).")
            val partial = File(target.path + ".part")
            conn.inputStream.use { input ->
                partial.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var read = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        read += n
                        onProgress((read.toFloat() / info.size).coerceIn(0f, 1f))
                    }
                }
            }
            if (partial.length() != info.size || !sha256(partial).equals(info.sha256, ignoreCase = true)) {
                partial.delete()
                throw UpdateException("Le fichier téléchargé est incomplet ou altéré. Réessayez.")
            }
            if (!partial.renameTo(target)) throw IOException("Écriture impossible.")
            target
        } finally {
            conn.disconnect()
        }
    }

    /** Android 8+ : l'utilisateur doit autoriser l'application à installer des mises à jour. */
    fun canInstall() = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    /** Ouvre le réglage « Installer des applications inconnues » de StudyMate AI. */
    fun openInstallPermission() {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Ouvre l'installateur d'Android sur l'APK vérifié. */
    fun install(file: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                digest.update(buf, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
