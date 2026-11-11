package com.studymateai.feature.courses

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.NoteAdd
import androidx.compose.material.icons.outlined.PostAdd
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.BandHeader
import com.studymateai.core.designsystem.EmptyState
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.designsystem.StatusChip
import com.studymateai.feature.common.DOC_STATUS
import com.studymateai.feature.common.SOURCE
import com.studymateai.feature.documents.KnowledgeBaseSection
import com.studymateai.feature.revision.RevisionFoldersSection
import com.studymateai.feature.revision.Subfolder
import com.studymateai.core.network.KnowledgeBaseDto
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatSize
import kotlinx.coroutines.launch

/** Saisie d'un nom (nouveau dossier, sous-dossier, leçon). */
@Composable
fun NameDialog(title: String, label: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(value, { value = it }, label = { Text(label) }, singleLine = true) },
        confirmButton = { TextButton(enabled = value.isNotBlank(), onClick = { onConfirm(value.trim()) }) { Text("Créer", color = SM.Crimson) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
        containerColor = SM.White,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    // Titre des écrans de détail dans la bande cramoisie du haut.
    BandHeader(title, onBack = onBack) { actions() }
}

@Composable
fun CoursesScreen(onCourse: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val courses by c.study.courses().collectAsState(null)
    var query by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    val filtered = courses?.filter { query.isBlank() || it.title.contains(query, true) || (it.code ?: "").contains(query, true) }
    Column {
    BandHeader("Mes dossiers", subtitle = "Un dossier par cours") {
        TextButton(onClick = { creating = true }) { Text("+ Dossier", color = SM.OnCrimson) }
    }
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            OutlinedTextField(query, { query = it }, placeholder = { Text("Rechercher un dossier") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        when {
            filtered == null -> item { com.studymateai.core.designsystem.Loading() }
            filtered.isEmpty() && query.isBlank() -> item {
                EmptyState("Commencez par créer un dossier", "Par exemple « Statistique » : vous y ajouterez vos PDF, scans et textes.", Icons.Outlined.MenuBook) { PrimaryButton("Créer un dossier", { creating = true }) }
            }
            filtered.isEmpty() -> item { EmptyState("Aucun dossier trouvé") }
            else -> items(filtered, key = { it.id }) { course ->
                SmCard(onClick = { onCourse(course.id) }) {
                    course.code?.let { Text(it.uppercase(), style = MaterialTheme.typography.labelMedium.copy(color = SM.Muted)) }
                    Text(course.title, style = MaterialTheme.typography.titleMedium)
                    Text(course.semesterName ?: "Sans semestre", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (course.isDemo) StatusChip("Démo")
                        if (course.serverUpdatedAt == null) StatusChip("Non synchronisé", SM.Warning)
                    }
                }
            }
        }
    }
    }
    if (creating) NameDialog("Nouveau dossier", "Nom du dossier (ex. Statistique)", { creating = false }) { title ->
        creating = false
        scope.launch { onCourse(c.study.createCourse(title, null)) }
    }
}

/**
 * Dossier d'un cours : les documents (seul endroit où l'on dépose des PDF) puis les trois
 * sous-dossiers fixes QCM, Flash-cards et Fiches de révision.
 */
@Composable
fun CourseContentScreen(courseId: String, onBack: () -> Unit, onDocument: (String) -> Unit, onScan: () -> Unit, onOpenBase: () -> Unit, refreshKey: Int, onGenerate: (Subfolder) -> Unit, onOpen: (Subfolder, String) -> Unit) {
    val c = container()
    val course by c.study.course(courseId).collectAsState(null)
    val documents by c.study.documents(courseId = courseId).collectAsState(emptyList())
    var stats by remember { mutableStateOf<KnowledgeBaseDto?>(null) }

    Column {
        BackBar(course?.title ?: "", onBack)
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { KnowledgeBaseSection(courseId, null, localDocuments = documents.size, onScan = onScan, onStats = { stats = it }, onOpenBase = onOpenBase) }
            // Documents regroupés dans une seule carte, icône selon le mode d'ajout.
            if (documents.isNotEmpty()) item {
                Surface(shape = RoundedCornerShape(12.dp), color = SM.White, border = BorderStroke(1.dp, SM.Border)) {
                    Column {
                        documents.forEachIndexed { i, d ->
                            if (i > 0) HorizontalDivider(color = SM.Border)
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { onDocument(d.id) }.padding(horizontal = 14.dp, vertical = 12.dp),
                            ) {
                                Box(Modifier.size(36.dp).background(SM.Crimson.copy(alpha = 0.08f), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                                    Icon(
                                        when (d.source) { "text" -> Icons.Outlined.ContentPaste; "scan" -> Icons.Outlined.DocumentScanner; else -> if (d.mimeType.startsWith("image/")) Icons.Outlined.Image else Icons.Outlined.PictureAsPdf },
                                        null, tint = SM.Crimson, modifier = Modifier.size(19.dp),
                                    )
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(d.fileName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOfNotNull(SOURCE[d.source] ?: "Fichier", formatSize(d.fileSize), DOC_STATUS[d.processingStatus].takeIf { d.processingStatus != "READY" }, if (d.localPath != null) "Hors ligne" else null).joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (d.processingStatus == "FAILED") SM.Error else SM.Muted,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            item { HorizontalDivider(color = SM.Border, modifier = Modifier.padding(vertical = 8.dp)) }
            item { RevisionFoldersSection(courseId, canGenerate = stats?.canGenerate ?: documents.isNotEmpty(), refreshKey = refreshKey, onGenerate = onGenerate, onOpen = onOpen) }
        }
    }
}
