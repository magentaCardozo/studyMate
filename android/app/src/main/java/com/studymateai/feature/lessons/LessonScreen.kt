package com.studymateai.feature.lessons

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.QuestionAnswer
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.designsystem.Loading
import com.studymateai.core.designsystem.MarkdownText
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.designsystem.StatusChip
import com.studymateai.feature.common.DOC_STATUS
import com.studymateai.feature.common.LESSON_STATUS
import com.studymateai.feature.common.container
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.launch

@Composable
fun LessonScreen(lessonId: String, onBack: () -> Unit, onDocument: (String) -> Unit, onNote: (String?) -> Unit, onAsk: () -> Unit, onGenerate: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val lesson by c.study.lesson(lessonId).collectAsState(null)
    val notes by c.study.notes(lessonId = lessonId).collectAsState(emptyList())
    val l = lesson
    Column {
        BackBar(l?.title ?: "Leçon", onBack)
        if (l == null) {
            Loading(); return@Column
        }
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusChip(LESSON_STATUS[l.status] ?: l.status, if (l.status == "COMPLETED") SM.Success else SM.Muted)
                    l.estimatedMinutes?.let { StatusChip("$it min") }
                }
                Spacer(Modifier.height(6.dp))
                Text(l.title, style = MaterialTheme.typography.headlineMedium)
                l.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium.copy(color = SM.Muted)) }
                Spacer(Modifier.height(10.dp))
                if (l.status == "COMPLETED") SecondaryButton("Rouvrir la leçon", { scope.launch { c.study.setLessonCompleted(l, false) } }, icon = Icons.Outlined.Replay)
                else PrimaryButton("Marquer comme terminée", { scope.launch { c.study.setLessonCompleted(l, true) } }, Modifier.fillMaxWidth(), icon = Icons.Outlined.CheckCircle)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Note", { onNote(null) }, icon = Icons.Outlined.EditNote)
                    SecondaryButton("Question", onAsk, icon = Icons.Outlined.QuestionAnswer)
                    SecondaryButton("Réviser", onGenerate)
                }
            }
            if (l.objectives.isNotBlank()) item {
                SmCard {
                    Text("Objectifs d’apprentissage", style = MaterialTheme.typography.titleSmall)
                    l.objectives.lines().filter { it.isNotBlank() }.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium) }
                }
            }
            item {
                SmCard {
                    if (l.content.isBlank()) Text("Cette leçon n’a pas encore de contenu. Rédigez-le depuis la version web.", style = MaterialTheme.typography.bodySmall)
                    else MarkdownText(l.content)
                }
            }
            item { SectionTitle("Mes notes") }
            if (notes.isEmpty()) item { Text("Aucune note personnelle.", style = MaterialTheme.typography.bodySmall) }
            items(notes, key = { it.id }) { n ->
                SmCard(onClick = { onNote(n.id) }) {
                    Text(n.title, style = MaterialTheme.typography.titleSmall)
                    if (n.dirty) StatusChip("Modifiée hors ligne", SM.Warning)
                }
            }
        }
    }
}
