package com.studymateai.feature.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import com.studymateai.core.designsystem.BandHeader
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.EmptyState
import com.studymateai.core.designsystem.ErrorState
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
import com.studymateai.core.network.CitationsDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.ACTIVITY
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatDate
import com.studymateai.feature.common.formatDay
import com.studymateai.feature.common.formatTime
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/** Agenda des sessions (hors ligne), examens et génération du programme (en ligne). */
@Composable
fun CoachScreen(onChat: () -> Unit, onLesson: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    val from = remember { Instant.now().minus(1, ChronoUnit.DAYS) }
    val sessions by c.study.sessionsFrom(from).collectAsState(emptyList())
    val goals by c.study.goals().collectAsState(emptyList())
    val courses by c.study.courses().collectAsState(emptyList())
    var planMessage by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val upcoming = sessions.filter { it.status == "PLANNED" || it.status == "MISSED" }
    val byDay = upcoming.groupBy { formatDay(it.scheduledStart) }

    fun plan(accept: Boolean) {
        busy = true; error = null
        scope.launch {
            try {
                val r = c.online.plan(accept)
                planMessage = if (accept) "Programme enregistré : ${r.summary.sessionCount} sessions." else "Proposition : ${r.summary.sessionCount} sessions, ${(r.summary.totalMinutes / 60).toInt()} h au total${if (r.summary.missedSessions > 0) ", ${r.summary.missedSessions} session(s) manquée(s) redistribuée(s)" else ""}."
                if (accept) c.sync.sync()
            } catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
        }
    }

    Column {
    BandHeader("Mon coach", subtitle = "Programme de révision et tuteur")
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("Tuteur IA", onChat, icon = Icons.Outlined.Chat)
                SecondaryButton("Proposer un programme", { plan(false) }, icon = Icons.Outlined.AutoAwesome, enabled = online && !busy)
            }
            if (!online) Text("Le programme et le tuteur nécessitent une connexion. Votre agenda reste consultable.", style = MaterialTheme.typography.bodySmall)
            planMessage?.let {
                Spacer(Modifier.height(8.dp))
                Notice(it, SM.Success)
                if (it.startsWith("Proposition")) PrimaryButton("Accepter le programme", { plan(true) }, Modifier.fillMaxWidth(), loading = busy)
            }
            error?.let { ErrorState(it) }
        }
        val exams = goals.filter { it.kind == "exam" && it.targetDate != null }
        if (exams.isNotEmpty()) {
            item { SectionTitle("Examens") }
            items(exams, key = { it.id }) { g ->
                val days = ChronoUnit.DAYS.between(Instant.now(), Instant.parse(g.targetDate!!))
                SmCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(g.title, style = MaterialTheme.typography.titleSmall)
                            Text("${formatDate(g.targetDate)} · ${courses.find { it.id == g.courseId }?.title ?: ""}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (days >= 0) StatusChip("J-$days", if (days <= 7) SM.Crimson else SM.Muted)
                    }
                }
            }
        }
        item { SectionTitle("Prochaines sessions") }
        if (byDay.isEmpty()) item {
            EmptyState("Vous n’avez pas encore de programme de révision.", "Ajoutez une date d’examen (version web), puis demandez un programme.", Icons.Outlined.CalendarMonth)
        }
        byDay.forEach { (day, list) ->
            item(key = "day-$day") { Text(day, style = MaterialTheme.typography.labelLarge.copy(color = SM.Muted), modifier = Modifier.padding(top = 6.dp)) }
            items(list, key = { it.id }) { s ->
                SmCard(onClick = s.lessonId?.let { id -> { onLesson(id) } }) {
                    Row(verticalAlignment = Alignment.Top) {
                        Text(formatTime(s.scheduledStart), style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(56.dp))
                        Column(Modifier.weight(1f)) {
                            Text("${courses.find { it.id == s.courseId }?.title ?: ""} — ${ACTIVITY[s.activityType]}", style = MaterialTheme.typography.titleSmall)
                            s.objective?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            s.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                            if (s.status == "MISSED") StatusChip("Manquée", SM.Warning)
                        }
                    }
                    Row {
                        TextButton(onClick = { scope.launch { c.study.setSessionStatus(s.id, "COMPLETED") } }) { Text("Fait", color = SM.Success) }
                        TextButton(onClick = { scope.launch { c.study.setSessionStatus(s.id, "SKIPPED") } }) { Text("Passer", color = SM.Muted) }
                    }
                }
            }
        }
    }
    }
}

data class ChatLine(val role: String, val text: String, val sources: String? = null)

/** Tuteur IA (en ligne) : réponses fondées sur les documents de l'étudiant, sources citées. */
@Composable
fun ChatScreen(courseId: String?, lessonId: String?, onBack: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    val lines = remember { mutableStateListOf<ChatLine>() }
    var input by remember { mutableStateOf("") }
    var threadId by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().imePadding()) {
        BackBar("Tuteur IA", onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(if (lessonId != null) "Contexte : leçon sélectionnée" else if (courseId != null) "Contexte : dossier sélectionné" else "Question générale", style = MaterialTheme.typography.bodySmall)
                if (!online) Notice("Le tuteur nécessite une connexion Internet.")
            }
            items(lines) { l ->
                if (l.role == "user") Text(l.text, color = SM.OnCrimson, modifier = Modifier.fillMaxWidth().background(SM.Crimson, RoundedCornerShape(10.dp)).padding(12.dp))
                else SmCard {
                    MarkdownText(l.text)
                    l.sources?.let { Text("Sources : $it", style = MaterialTheme.typography.bodySmall) }
                }
            }
            error?.let { item { ErrorState(it) } }
        }
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(input, { input = it }, placeholder = { Text("Votre question…") }, modifier = Modifier.weight(1f))
            IconButton(enabled = online && input.isNotBlank() && !busy, onClick = {
                val q = input.trim(); input = ""; lines += ChatLine("user", q); busy = true; error = null
                scope.launch {
                    try {
                        val r = c.online.ask(q, threadId, courseId, lessonId)
                        threadId = r.threadId
                        val cit = r.message.citations?.let { runCatching { AppJson.decodeFromJsonElement(CitationsDto.serializer(), it) }.getOrNull() }
                        lines += ChatLine("assistant", r.message.content, cit?.refs?.takeIf { it.isNotEmpty() }?.joinToString { s -> s.title + (s.page?.let { p -> ", p. $p" } ?: "") })
                    } catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
                }
            }) { Icon(Icons.AutoMirrored.Outlined.Send, "Envoyer", tint = SM.Crimson) }
        }
        Text("Le tuteur peut se tromper : vérifiez dans vos sources.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 16.dp, bottom = 8.dp))
    }
}
