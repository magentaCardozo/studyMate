package com.studymateai.feature.revision

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Quiz
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.database.FlashcardEntity
import com.studymateai.core.designsystem.EmptyState
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Loading
import com.studymateai.core.designsystem.MarkdownText
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.designsystem.StatusChip
import com.studymateai.core.network.AppJson
import com.studymateai.core.network.QuestionDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.domain.QuizScoring
import com.studymateai.feature.common.container
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun RevisionScreen(onStudy: (String?) -> Unit, onQuiz: (String) -> Unit, onGenerate: () -> Unit) {
    val c = container()
    val decks by c.study.decks().collectAsState(emptyList())
    val counts by c.study.deckCounts().collectAsState(emptyList())
    val quizzes by c.study.quizzes().collectAsState(emptyList())
    val totalDue = counts.sumOf { it.due }
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            SectionTitle("Révisions")
            Text("Les cartes et les quiz d’entraînement fonctionnent hors ligne.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            if (totalDue > 0) PrimaryButton("Réviser $totalDue carte(s)", { onStudy(null) }, Modifier.fillMaxWidth(), icon = Icons.Outlined.Style)
            Spacer(Modifier.height(6.dp))
            SecondaryButton("Générer du matériel (en ligne)", onGenerate)
        }
        item { SectionTitle("Cartes mémoire") }
        if (decks.isEmpty()) item { EmptyState("Aucun paquet de cartes", "Générez des cartes depuis une leçon (connexion requise).", Icons.Outlined.Style) }
        items(decks, key = { it.id }) { d ->
            val count = counts.find { it.deckId == d.id }
            SmCard(onClick = { onStudy(d.id) }) {
                Text(d.title, style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${count?.total ?: 0} cartes", style = MaterialTheme.typography.bodySmall)
                    if ((count?.due ?: 0) > 0) StatusChip("${count!!.due} à revoir", SM.Crimson)
                    if (d.origin == "ai") StatusChip("Généré")
                }
            }
        }
        item { SectionTitle("Quiz") }
        if (quizzes.isEmpty()) item { Text("Aucun quiz pour le moment.", style = MaterialTheme.typography.bodySmall) }
        items(quizzes, key = { it.id }) { q ->
            SmCard(onClick = { onQuiz(q.id) }) {
                Text(q.title, style = MaterialTheme.typography.titleSmall)
                Text(if (q.offlineEligible) "Entraînement · disponible hors ligne" else "Mode examen · en ligne (version web)", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

/** Étude des cartes entièrement hors ligne ; les réponses sont synchronisées ensuite. */
@Composable
fun FlashcardStudyScreen(deckId: String?, onBack: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    var queue by remember { mutableStateOf<List<FlashcardEntity>?>(null) }
    var index by remember { mutableIntStateOf(0) }
    var revealed by remember { mutableStateOf(false) }
    LaunchedEffect(deckId) { queue = c.study.dueCards(deckId) }
    val q = queue
    Column(Modifier.fillMaxSize()) {
        BackBar("Étude des cartes", onBack)
        when {
            q == null -> Loading()
            q.isEmpty() -> EmptyState("Aucune carte à réviser pour le moment.", "Les cartes réapparaissent quand il est temps de les revoir.")
            index >= q.size -> EmptyState("Séance terminée", "${q.size} réponse(s) enregistrée(s) sur l’appareil. Elles seront synchronisées automatiquement.") { PrimaryButton("Terminer", onBack) }
            else -> {
                val card = q[index]
                Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    LinearProgressIndicator(progress = { index.toFloat() / q.size }, modifier = Modifier.fillMaxWidth(), color = SM.Crimson, trackColor = SM.Border)
                    Text("Carte ${index + 1} / ${q.size}", style = MaterialTheme.typography.bodySmall)
                    SmCard(Modifier.heightIn(min = 260.dp)) {
                        Text("QUESTION", style = MaterialTheme.typography.labelMedium.copy(color = SM.Muted))
                        MarkdownText(card.question)
                        if (revealed) {
                            Spacer(Modifier.height(16.dp))
                            Text("RÉPONSE", style = MaterialTheme.typography.labelMedium.copy(color = SM.Muted))
                            MarkdownText(card.answer)
                        }
                    }
                    if (!revealed) PrimaryButton("Afficher la réponse", { revealed = true }, Modifier.fillMaxWidth())
                    else {
                        val ratings = listOf(0 to "À revoir", 1 to "Difficile", 2 to "Compris", 3 to "Facile")
                        ratings.chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { (value, label) ->
                                    OutlinedButton(
                                        onClick = {
                                            scope.launch {
                                                c.study.reviewCard(card, value)
                                                if (value == 0) queue = q + card // la carte revient en fin de séance
                                                index++; revealed = false
                                            }
                                        },
                                        modifier = Modifier.weight(1f).height(52.dp),
                                        border = BorderStroke(1.dp, if (value == 0) SM.Error.copy(alpha = .4f) else if (value == 2) SM.Success.copy(alpha = .4f) else SM.Border),
                                    ) { Text(label, color = SM.Charcoal) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Quiz d'entraînement corrigé localement (hors ligne). Les quiz d'examen restent en ligne. */
@Composable
fun QuizScreen(quizId: String, onBack: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    var questions by remember { mutableStateOf<List<QuestionDto>?>(null) }
    var title by remember { mutableStateOf("") }
    var eligible by remember { mutableStateOf(true) }
    val answers = remember { mutableStateMapOf<String, Any>() }
    var submitted by remember { mutableStateOf(false) }
    var score by remember { mutableStateOf(0.0) }
    LaunchedEffect(quizId) {
        c.study.quiz(quizId)?.let {
            title = it.title
            eligible = it.offlineEligible
            questions = AppJson.decodeFromString(ListSerializer(QuestionDto.serializer()), it.questionsJson)
        }
    }
    fun options(q: QuestionDto): List<String> = (q.options as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
    fun correctOf(q: QuestionDto): Any? = when (val e: JsonElement? = q.correctAnswer) {
        is JsonPrimitive -> e.booleanOrNull ?: e.doubleOrNull ?: e.content
        is JsonArray -> e.map { it.jsonPrimitive.let { p -> p.doubleOrNull ?: p.content } }
        else -> null
    }
    Column(Modifier.fillMaxSize()) {
        BackBar(title.ifBlank { "Quiz" }, onBack)
        val qs = questions
        when {
            qs == null -> Loading()
            !eligible -> Column(Modifier.padding(16.dp)) { Notice("Ce quiz est en mode examen : les corrections ne sont pas stockées sur l’appareil. Passez-le en ligne depuis la version web.") }
            else -> LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (submitted) item {
                    SmCard {
                        Text("Résultat : ${score.toInt()} / ${qs.sumOf { it.points }.toInt()}", style = MaterialTheme.typography.titleLarge)
                        Text("Résultat enregistré sur l’appareil (entraînement hors ligne).", style = MaterialTheme.typography.bodySmall)
                    }
                }
                items(qs, key = { it.id }) { q ->
                    SmCard {
                        Text("Question ${q.ordinal + 1}", style = MaterialTheme.typography.labelMedium.copy(color = SM.Muted))
                        MarkdownText(q.question)
                        Spacer(Modifier.height(8.dp))
                        when (q.questionType) {
                            "SINGLE_CHOICE", "TRUE_FALSE" -> {
                                val opts = if (q.questionType == "TRUE_FALSE") listOf("Vrai", "Faux") else options(q)
                                opts.forEachIndexed { i, o ->
                                    val value: Any = if (q.questionType == "TRUE_FALSE") i == 0 else i.toDouble()
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        RadioButton(selected = answers[q.id] == value, onClick = { if (!submitted) answers[q.id] = value })
                                        Text(o)
                                    }
                                }
                            }
                            "SHORT_ANSWER", "FILL_BLANK" -> OutlinedTextField((answers[q.id] as? String) ?: "", { if (!submitted) answers[q.id] = it }, label = { Text("Votre réponse") }, modifier = Modifier.fillMaxWidth())
                            else -> Text("Type de question disponible sur la version web.", style = MaterialTheme.typography.bodySmall)
                        }
                        if (submitted) {
                            val credit = QuizScoring.score(q.questionType, correctOf(q), answers[q.id])
                            Text(if (credit >= 1.0) "Bonne réponse" else "Réponse incorrecte", color = if (credit >= 1.0) SM.Success else SM.Error, style = MaterialTheme.typography.titleSmall)
                            q.explanation?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
                if (!submitted) item {
                    PrimaryButton("Remettre", {
                        score = qs.sumOf { QuizScoring.score(it.questionType, correctOf(it), answers[it.id]) * it.points }
                        submitted = true
                        scope.launch { c.study.saveLocalQuizResult(quizId, score, qs.sumOf { it.points }) }
                    }, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

/**
 * Exploiter la base de connaissances d'un dossier : QCM, fiches de révision ou cartes mémoire.
 * Nécessite une connexion (aucune IA sur l'appareil).
 */
@Composable
fun GenerateDialog(courseId: String?, folderId: String?, lessonId: String?, initialKind: String = "qcm", onDismiss: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    var kind by remember { mutableStateOf(initialKind) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val courses by c.study.courses().collectAsState(emptyList())
    var selectedCourse by remember { mutableStateOf(courseId) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SM.White,
        title = { Text("Réviser à partir de la base") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (!online) Notice("Connexion requise : la génération utilise le serveur. Aucun modèle d’IA ne fonctionne sur l’appareil.")
                Text("Généré uniquement à partir des documents du dossier.", style = MaterialTheme.typography.bodySmall)
                listOf("qcm" to "Questionnaire à choix multiple (QCM)", "summary" to "Fiches de révision", "flashcards" to "Cartes mémoire").forEach { (id, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(kind == id, { kind = id }); Text(label) }
                }
                if (courseId == null && folderId == null && lessonId == null) {
                    Text("Dossier", style = MaterialTheme.typography.labelLarge)
                    courses.forEach { co -> Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(selectedCourse == co.id, { selectedCourse = co.id }); Text(co.title) } }
                }
                message?.let { Text(it, color = SM.Success) }
                error?.let { ErrorState(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = online && !busy && (lessonId != null || folderId != null || selectedCourse != null), onClick = {
                busy = true; error = null
                scope.launch {
                    try {
                        // Portée la plus précise : sous-dossier, sinon dossier (ou leçon).
                        val course = selectedCourse.takeIf { folderId == null && lessonId == null }
                        when (kind) {
                            "summary" -> c.online.summary(course, folderId, lessonId)
                            "flashcards" -> c.online.flashcards(course, folderId, lessonId)
                            else -> c.online.qcm(course, folderId, lessonId)
                        }
                        runCatching { c.sync.sync() }
                        message = when (kind) {
                            "summary" -> "Fiches de révision générées : consultez-les sur la version web."
                            "qcm" -> "QCM généré : disponible dans Révisions, même hors ligne."
                            else -> "Cartes générées : disponibles dans Révisions, même hors ligne."
                        }
                    } catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
                }
            }) { Text(if (busy) "Génération…" else "Générer", color = SM.Crimson) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } },
    )
}
