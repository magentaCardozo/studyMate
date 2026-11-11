package com.studymateai.feature.revision

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.IntrinsicSize
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.network.ReviewDto
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material3.Checkbox
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
import com.studymateai.core.designsystem.BandHeader
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

/**
 * Onglet Révisions : on n'y génère rien (la génération se fait dans les dossiers). On y termine les
 * QCM et on y retravaille les questions ratées ; les flash-cards se révisent hors ligne.
 */
@Composable
fun RevisionScreen(onStudy: (String?) -> Unit, onQuiz: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    val counts by c.study.deckCounts().collectAsState(emptyList())
    val localQuizzes by c.study.quizzes().collectAsState(emptyList())
    val totalDue = counts.sumOf { it.due }
    var review by remember { mutableStateOf<ReviewDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    LaunchedEffect(online, refresh) {
        if (!online) return@LaunchedEffect
        runCatching { c.sync.sync() } // envoie d'abord les QCM passés hors ligne
        try { review = c.online.review(); error = null } catch (e: Exception) { error = e.toUserMessage() }
    }
    // Ouvre un QCM sur l'appareil (il doit être synchronisé localement).
    fun open(quizId: String) = scope.launch {
        busy = quizId
        if (c.study.quiz(quizId) == null) runCatching { c.sync.sync() }
        busy = null
        onQuiz(quizId)
    }
    fun retry(courseId: String?) = scope.launch {
        busy = courseId ?: "all"
        try {
            val id = c.online.mistakesQuiz(courseId)
            runCatching { c.sync.sync() }
            onQuiz(id)
        } catch (e: Exception) { error = e.toUserMessage() } finally { busy = null }
    }
    val r = review
    Column {
    BandHeader("Révisions", subtitle = "QCM à terminer et questions ratées")
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                StatTile("${r?.toFinish?.size ?: "–"}", "QCM à terminer", SM.Crimson, Modifier.weight(1f).fillMaxHeight())
                StatTile("${r?.mistakes?.size ?: "–"}", if ((r?.mistakes?.size ?: 0) > 1) "questions ratées" else "question ratée", SM.Warning, Modifier.weight(1f).fillMaxHeight())
                StatTile("$totalDue", if (totalDue > 1) "cartes à revoir" else "carte à revoir", SM.Charcoal, Modifier.weight(1f).fillMaxHeight())
            }
        }
        if (!online) item { Notice("Hors ligne : les QCM et les cartes déjà synchronisés restent utilisables ; la liste des erreurs se met à jour à la reconnexion.") }
        error?.let { e -> item { ErrorState(e) { refresh++ } } }

        // 1. QCM à terminer (hors ligne : QCM de l'appareil jamais faits)
        item { SectionTitle("QCM à terminer") }
        val toFinish = r?.toFinish
        if (toFinish == null && !online) {
            if (localQuizzes.isEmpty()) item { Text("Aucun QCM sur l’appareil.", style = MaterialTheme.typography.bodySmall) }
            items(localQuizzes.filter { it.offlineEligible }, key = { "l-" + it.id }) { q ->
                SmCard(onClick = { onQuiz(q.id) }) { ListRow(q.title, "Disponible hors ligne", Icons.Outlined.Quiz) }
            }
        } else if (toFinish != null && toFinish.isEmpty()) {
            item { Text("Tous vos QCM sont terminés.", style = MaterialTheme.typography.bodySmall) }
        } else if (toFinish != null) {
            items(toFinish, key = { it.quizId }) { t ->
                SmCard(onClick = { open(t.quizId) }) {
                    Text(t.title, style = MaterialTheme.typography.titleSmall)
                    Text(
                        listOfNotNull(t.course?.title ?: if (t.isReview) "Rattrapage" else null, if (t.isMockExam) "Examen blanc · en ligne" else null, if (t.status == "in_progress") "commencé sur le web · ${t.answered}/${t.totalQuestions}" else "jamais commencé").joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (t.status == "in_progress" && t.totalQuestions > 0) {
                        Spacer(Modifier.height(6.dp))
                        LinearProgressIndicator(progress = { t.answered.toFloat() / t.totalQuestions }, modifier = Modifier.fillMaxWidth(), color = SM.Crimson, trackColor = SM.Border)
                    }
                    if (busy == t.quizId) Text("Ouverture…", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        // 2. Questions ratées
        item { SectionTitle("Questions ratées") }
        val mistakes = r?.mistakes
        if (mistakes != null && mistakes.isEmpty()) item { Text("Aucune question ratée : bravo.", style = MaterialTheme.typography.bodySmall) }
        if (!mistakes.isNullOrEmpty()) {
            item {
                PrimaryButton(if (busy == "all") "Préparation…" else "Retravailler ${mistakes.size} question${if (mistakes.size > 1) "s" else ""}", { retry(null) }, Modifier.fillMaxWidth(), enabled = online && busy == null, icon = Icons.Outlined.Replay)
                Text("Une question quitte cette liste dès que vous y répondez juste.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            }
            mistakes.groupBy { it.course?.title ?: "Sans dossier" }.forEach { (course, list) ->
                item(key = "c-$course") { Text("${course.uppercase()} · ${list.size}", style = MaterialTheme.typography.labelMedium, color = SM.Muted, modifier = Modifier.padding(top = 6.dp)) }
                items(list, key = { it.questionId }) { m ->
                    SmCard {
                        Text(m.question, style = MaterialTheme.typography.bodyMedium)
                        Text("${m.quiz.title} · ratée ${if (m.wrongCount > 1) "${m.wrongCount} fois" else "une fois"}", style = MaterialTheme.typography.bodySmall, color = SM.Muted)
                    }
                }
            }
        }

        // 3. Flash-cards (hors ligne)
        if (totalDue > 0) item {
            SectionTitle("Flash-cards")
            PrimaryButton("Réviser $totalDue carte(s)", { onStudy(null) }, Modifier.fillMaxWidth(), icon = Icons.Outlined.Style)
        }
    }
    }
}

@Composable
private fun StatTile(value: String, label: String, tint: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    SmCard(modifier) {
        Text(value, style = MaterialTheme.typography.headlineSmall, color = tint)
        Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 2)
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
                        Text("Les questions ratées apparaîtront dans Révisions (dès la prochaine synchronisation si vous êtes hors ligne).", style = MaterialTheme.typography.bodySmall)
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
                            "MULTIPLE_CHOICE" -> {
                                Text("Plusieurs réponses possibles", style = MaterialTheme.typography.bodySmall.copy(color = SM.Muted))
                                options(q).forEachIndexed { i, o ->
                                    @Suppress("UNCHECKED_CAST")
                                    val chosen = (answers[q.id] as? List<Double>).orEmpty()
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Checkbox(checked = i.toDouble() in chosen, onCheckedChange = { on ->
                                            if (!submitted) answers[q.id] = (if (on) chosen + i.toDouble() else chosen - i.toDouble()).sorted()
                                        })
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
                        scope.launch {
                            c.study.saveQuizAttempt(quizId, score, qs.sumOf { it.points }, answers.toMap())
                            runCatching { c.sync.sync() } // hors ligne : envoyé à la prochaine synchronisation
                        }
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
/** kinds : types proposés (un sous-dossier n'offre que le sien) ; onGenerated : rafraîchir le sous-dossier. */
fun GenerateDialog(courseId: String?, folderId: String?, lessonId: String?, initialKind: String = "qcm", kinds: List<String>? = null, onGenerated: () -> Unit = {}, onDismiss: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    var kind by remember { mutableStateOf(initialKind) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val courses by c.study.courses().collectAsState(emptyList())
    var selectedCourse by remember { mutableStateOf(courseId) }
    val labels = listOf("qcm" to "Questionnaire à choix multiple (QCM)", "summary" to "Fiches de révision", "flashcards" to "Flash-cards").filter { kinds == null || it.first in kinds }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SM.White,
        title = { Text(if (labels.size == 1) "Générer : ${labels[0].second}" else "Réviser à partir de la base") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (!online) Notice("Connexion requise : la génération utilise le serveur. Aucun modèle d’IA ne fonctionne sur l’appareil.")
                Text("Généré uniquement à partir des documents du dossier.", style = MaterialTheme.typography.bodySmall)
                if (labels.size > 1) labels.forEach { (id, label) ->
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
                        onGenerated()
                        message = when (kind) {
                            "summary" -> "Fiche de révision générée : elle est rangée dans le sous-dossier « Fiches de révision »."
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
