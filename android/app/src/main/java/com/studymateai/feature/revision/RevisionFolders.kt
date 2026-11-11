package com.studymateai.feature.revision

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.clickable
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.BandHeader
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.network.CourseRevisionsDto
import com.studymateai.core.network.RevisionItemDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatDay
import com.studymateai.feature.common.formatTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Les trois sous-dossiers fixes d'un dossier : uniquement du contenu généré à partir des documents. */
enum class Subfolder(val label: String, val kind: String, val empty: String) {
    QCM("QCM", "qcm", "Aucun QCM pour l’instant."),
    FLASHCARDS("Flash-cards", "flashcards", "Aucun paquet de flash-cards pour l’instant."),
    FICHES("Fiches de révision", "summary", "Aucune fiche de révision pour l’instant."),
}

private fun CourseRevisionsDto.of(s: Subfolder) = when (s) { Subfolder.QCM -> qcm; Subfolder.FLASHCARDS -> flashcards; Subfolder.FICHES -> fiches }

private fun dayLabel(iso: String): String {
    val day = Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate()
    val today = LocalDate.now()
    return when (day) { today -> "Aujourd’hui"; today.minusDays(1) -> "Hier"; else -> formatDay(iso) + " " + day.year }
}

private val LENGTH = mapOf("brief" to "brève", "standard" to "standard", "detailed" to "détaillée")

private fun RevisionItemDto.meta(s: Subfolder) = formatTime(createdAt) + " · " + when (s) {
    Subfolder.QCM -> "${questions ?: 0} question(s)" + (lastScore?.let { " · dernier score $it %" } ?: "")
    Subfolder.FLASHCARDS -> "${cards ?: 0} carte(s)"
    Subfolder.FICHES -> "fiche ${LENGTH[length] ?: length ?: ""}"
}

/**
 * Sous-dossiers QCM, Flash-cards et Fiches de révision : chacun a son bouton « Générer »
 * (à partir de la base de connaissances actuelle) et liste son contenu regroupé par date.
 */
@Composable
fun RevisionFoldersSection(courseId: String, canGenerate: Boolean, refreshKey: Int, onGenerate: (Subfolder) -> Unit, onOpen: (Subfolder, String) -> Unit) {
    val c = container()
    val online by c.isOnline.collectAsState()
    var selected by rememberSaveable { mutableStateOf(Subfolder.QCM) }
    var data by remember { mutableStateOf<CourseRevisionsDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(courseId, online, refreshKey) {
        if (!online) return@LaunchedEffect
        try { data = c.online.revisions(courseId); error = null } catch (e: Exception) { error = e.toUserMessage() }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle("Révisions générées")
        // Les trois sous-dossiers, en onglets : le contenu du sous-dossier choisi s'affiche juste en dessous.
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            Subfolder.entries.forEach { s ->
                val active = s == selected
                val count = data?.of(s)?.size
                Surface(
                    onClick = { selected = s },
                    shape = RoundedCornerShape(10.dp),
                    color = if (active) SM.Crimson else SM.White,
                    border = BorderStroke(1.dp, if (active) SM.Crimson else SM.Border),
                    modifier = Modifier.weight(1f).semantics { this.selected = active; role = Role.Tab },
                ) {
                    Column(Modifier.padding(vertical = 10.dp, horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            if (s == Subfolder.FICHES) "Fiches" else s.label,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (active) SM.OnCrimson else MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                        )
                        Text(
                            count?.toString() ?: "–",
                            style = MaterialTheme.typography.titleMedium,
                            color = if (active) SM.OnCrimson else SM.Crimson,
                        )
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            Text(
                when (selected) {
                    Subfolder.QCM -> "QCM corrigés, avec explications et sources."
                    Subfolder.FLASHCARDS -> "Cartes question-réponse, révision espacée."
                    Subfolder.FICHES -> "Notions clés, définitions, formules, exemples."
                },
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f).padding(end = 8.dp),
            )
            PrimaryButton("Générer", { onGenerate(selected) }, enabled = online && canGenerate, icon = Icons.Outlined.AutoAwesome)
        }
        if (!online) Notice("La génération et la liste à jour nécessitent une connexion. Les QCM et cartes déjà synchronisés restent dans Révisions.")
        else if (!canGenerate) Text("Ajoutez au moins un document lisible dans ce dossier pour pouvoir générer.", style = MaterialTheme.typography.bodySmall)
        error?.let { ErrorState(it) }
        val items = data?.of(selected).orEmpty()
        if (data != null && items.isEmpty()) Text(selected.empty, style = MaterialTheme.typography.bodySmall)
        // Regroupement par jour de génération, du plus récent au plus ancien.
        items.groupBy { dayLabel(it.createdAt) }.forEach { (day, group) ->
            Text(day.uppercase(), style = MaterialTheme.typography.labelMedium, color = SM.Muted, modifier = Modifier.padding(top = 6.dp))
            Surface(shape = RoundedCornerShape(12.dp), color = SM.White, border = BorderStroke(1.dp, SM.Border)) {
                Column {
                    group.forEachIndexed { i, item ->
                        if (i > 0) HorizontalDivider(color = SM.Border)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth().clickable { onOpen(selected, item.id) }.padding(horizontal = 14.dp, vertical = 12.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 2)
                                Text(item.meta(selected), style = MaterialTheme.typography.bodySmall, color = SM.Muted)
                            }
                            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = SM.Muted)
                        }
                    }
                }
            }
        }
    }
}

/** Fiche de révision générée (consultation en ligne). */
@Composable
fun SummaryScreen(id: String, onBack: () -> Unit) {
    val c = container()
    var content by remember { mutableStateOf<JsonObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        try { content = c.online.summaryContent(id) as? JsonObject } catch (e: Exception) { error = e.toUserMessage() }
    }
    val s = content
    Column {
        BandHeader(s?.str("title") ?: "Fiche de révision", onBack = onBack)
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            error?.let { e -> item { ErrorState(e) } }
            if (s == null && error == null) item { Text("Chargement…") }
            val body = s?.get("content") as? JsonObject
            if (body != null) {
                if (s.str("provider") == "mock") item { Notice("Mode démonstration : fiche produite par extraction de phrases de vos documents.") }
                body.str("mainTopic")?.let { t -> item { Text(t, style = MaterialTheme.typography.titleLarge) } }
                section(body, "keyConcepts", "Notions clés") { it.str("term") to it.str("explanation") }
                section(body, "definitions", "Définitions") { it.str("term") to it.str("definition") }
                section(body, "formulas", "Formules") { it.str("expression") to it.str("description") }
                section(body, "examples", "Exemples") { it.str("title") to it.str("content") }
                section(body, "commonMistakes", "Erreurs fréquentes") { it.str("mistake") to it.str("correction") }
                body.str("recap")?.takeIf { it.isNotBlank() }?.let { r -> item { SectionTitle("À retenir"); Text(r) } }
                val questions = (body["selfAssessment"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content }
                if (questions.isNotEmpty()) item { SectionTitle("Auto-évaluation"); questions.forEach { Text("• $it") } }
            }
        }
    }
}

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun androidx.compose.foundation.lazy.LazyListScope.section(body: JsonObject, key: String, title: String, pick: (JsonObject) -> Pair<String?, String?>) {
    val entries = (body[key] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(pick) }
    if (entries.isEmpty()) return
    item { SectionTitle(title) }
    entries.forEach { (head, text) ->
        item {
            SmCard {
                head?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                text?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
}

