package com.studymateai.feature.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import com.studymateai.core.designsystem.BandHeader
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.EmptyState
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.designsystem.StatusChip
import com.studymateai.feature.common.ACTIVITY
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatDate
import com.studymateai.feature.common.formatTime
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Accueil : calculé à partir des données locales, donc disponible hors ligne. */
@Composable
fun HomeScreen(onCourse: (String) -> Unit, onCourses: () -> Unit, onStudy: () -> Unit, onCoach: () -> Unit, onScan: () -> Unit) {
    val c = container()
    val name by c.prefs.userName.collectAsState(null)
    val startOfDay = remember { LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant() }
    val sessions by c.study.sessionsFrom(startOfDay).collectAsState(emptyList())
    val courses by c.study.courses().collectAsState(emptyList())
    val goals by c.study.goals().collectAsState(emptyList())
    val counts by c.study.deckCounts().collectAsState(emptyList())
    val today = LocalDate.now()
    val todaySessions = sessions.filter { Instant.parse(it.scheduledStart).atZone(ZoneId.systemDefault()).toLocalDate() == today }
    val due = counts.sumOf { it.due }
    val exams = goals.filter { it.kind == "exam" && it.targetDate != null && Instant.parse(it.targetDate) > Instant.now() }

    Column {
    BandHeader("Bonjour, ${name?.substringBefore(' ') ?: ""}", subtitle = "Votre espace d’apprentissage du jour")
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            if (due > 0) PrimaryButton("Continuer mes révisions ($due cartes)", onStudy, Modifier.fillMaxWidth(), icon = Icons.Outlined.Style)
        }
        if (courses.isEmpty()) {
            item {
                EmptyState("Commencez par créer un dossier", "Par exemple « Statistique » : vous y ajouterez vos PDF, scans et textes, qui formeront sa base de connaissances.", Icons.Outlined.MenuBook) {
                    PrimaryButton("Créer un dossier", onCourses)
                }
            }
        }
        item { SectionTitle("Programme du jour") }
        if (todaySessions.isEmpty()) {
            item {
                SmCard {
                    Text("Vous n’avez pas encore de programme de révision.", style = MaterialTheme.typography.titleSmall)
                    Text("Choisissez un dossier et une date d’examen pour commencer.", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    SecondaryButton("Mon coach", onCoach)
                }
            }
        } else items(todaySessions, key = { it.id }) { s ->
            SmCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(formatTime(s.scheduledStart), style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(56.dp))
                    Text("${courses.find { it.id == s.courseId }?.title ?: ""} · ${ACTIVITY[s.activityType]}", modifier = Modifier.weight(1f))
                    if (s.status == "COMPLETED") StatusChip("Fait", SM.Success)
                }
            }
        }
        if (exams.isNotEmpty()) {
            item { SectionTitle("Examens à venir") }
            items(exams, key = { it.id }) { e -> ListRow(e.title, formatDate(e.targetDate!!)) }
        }
        if (courses.isNotEmpty()) {
            item { SectionTitle("Mes dossiers") }
            items(courses.take(4), key = { it.id }) { course ->
                SmCard(onClick = { onCourse(course.id) }) {
                    Text(course.title, style = MaterialTheme.typography.titleMedium)
                    Text(listOfNotNull(course.code, course.semesterName).joinToString(" · ").ifEmpty { "Sans semestre" }, style = MaterialTheme.typography.bodySmall)
                    if (course.isDemo) StatusChip("Démo")
                }
            }
        }
        item {
            Spacer(Modifier.height(4.dp))
            SecondaryButton("Scanner un document", onScan, icon = Icons.Outlined.DocumentScanner)
        }
    }
    }
}
