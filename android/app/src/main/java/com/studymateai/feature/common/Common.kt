package com.studymateai.feature.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.studymateai.app.AppContainer
import com.studymateai.app.StudyMateApp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun container(): AppContainer = (LocalContext.current.applicationContext as StudyMateApp).container

/** ViewModel construit à partir du conteneur de dépendances. */
@Composable
inline fun <reified T : ViewModel> appViewModel(key: String? = null, crossinline create: (AppContainer) -> T): T {
    val c = container()
    return viewModel(key = key, factory = viewModelFactory { initializer { create(c) } })
}

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Ready<T>(val data: T) : UiState<T>
    data class Failed(val message: String) : UiState<Nothing>
}

private val fr = Locale.FRENCH
private val zone get() = ZoneId.systemDefault()

fun formatDay(iso: String): String = DateTimeFormatter.ofPattern("EEEE d MMMM", fr).withZone(zone).format(Instant.parse(iso)).replaceFirstChar { it.uppercase() }
fun formatTime(iso: String): String = DateTimeFormatter.ofPattern("HH:mm", fr).withZone(zone).format(Instant.parse(iso))
fun formatDate(iso: String): String = DateTimeFormatter.ofPattern("d MMM yyyy", fr).withZone(zone).format(Instant.parse(iso))
fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes o"
    bytes < 1024 * 1024 -> "${bytes / 1024} Ko"
    else -> String.format(fr, "%.1f Mo", bytes / 1024.0 / 1024.0)
}

val ACTIVITY = mapOf("lesson" to "Étude de leçon", "flashcards" to "Cartes mémoire", "quiz" to "Quiz", "mock_exam" to "Examen blanc", "summary" to "Résumé", "free" to "Révision libre")
val LESSON_STATUS = mapOf("NOT_STARTED" to "À commencer", "IN_PROGRESS" to "En cours", "COMPLETED" to "Terminée")
val SOURCE = mapOf("file" to "Fichier", "scan" to "Scan", "text" to "Texte collé")
val DOC_STATUS = mapOf("PENDING_UPLOAD" to "Import en attente", "UPLOADED" to "Importé", "QUEUED" to "En file d’attente", "PROCESSING" to "Analyse en cours", "READY" to "Prêt", "FAILED" to "Échec de l’analyse")
