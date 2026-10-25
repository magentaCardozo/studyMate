package com.studymateai.feature.courses

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
    TopAppBar(
        title = { Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1) },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Retour") } },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = SM.Ivory),
        // Les marges système sont déjà appliquées par le Scaffold principal.
        windowInsets = WindowInsets(0, 0, 0, 0),
    )
}

@Composable
fun CoursesScreen(onCourse: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val courses by c.study.courses().collectAsState(null)
    var query by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    val filtered = courses?.filter { query.isBlank() || it.title.contains(query, true) || (it.code ?: "").contains(query, true) }
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            SectionTitle("Mes dossiers") { TextButton(onClick = { creating = true }) { Text("+ Dossier", color = SM.Crimson) } }
            Text("Un dossier par cours : ses documents forment la base de connaissances de vos QCM et fiches.", style = MaterialTheme.typography.bodySmall)
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
    if (creating) NameDialog("Nouveau dossier", "Nom du dossier (ex. Statistique)", { creating = false }) { title ->
        creating = false
        scope.launch { onCourse(c.study.createCourse(title, null)) }
    }
}

/**
 * Contenu d'un dossier ou d'un sous-dossier : base de connaissances puis organisation
 * (arborescence générée à partir des données locales). folderId = null → racine du dossier.
 */
@Composable
fun CourseContentScreen(courseId: String, folderId: String?, onBack: () -> Unit, onFolder: (String) -> Unit, onLesson: (String) -> Unit, onDocument: (String) -> Unit, onNewNote: () -> Unit, onScan: () -> Unit, onGenerate: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val course by c.study.course(courseId).collectAsState(null)
    val folders by c.study.folders(courseId).collectAsState(emptyList())
    val lessons by c.study.lessons(courseId).collectAsState(emptyList())
    val documents by c.study.documents(courseId = courseId).collectAsState(emptyList())
    var dialog by remember { mutableStateOf<String?>(null) }
    val current = folders.find { it.id == folderId }
    val subfolders = folders.filter { it.parentFolderId == folderId }
    val here = lessons.filter { it.folderId == folderId }
    val docsHere = documents.filter { it.folderId == folderId }
    // Fil d'Ariane : Dossier › Sous-dossier › …
    val trail = generateSequence(current) { f -> folders.find { it.id == f.parentFolderId } }.toList().reversed()

    Column {
        BackBar(current?.name ?: course?.title ?: "", onBack)
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Text((listOf(course?.title ?: "") + trail.map { it.name }).joinToString(" › "), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                KnowledgeBaseSection(courseId, folderId, localDocuments = if (folderId == null) documents.size else docsHere.size, onScan = onScan, onGenerate = onGenerate)
            }
            if (docsHere.isNotEmpty()) item { SectionTitle("Documents") }
            items(docsHere, key = { "doc-" + it.id }) { d ->
                SmCard(onClick = { onDocument(d.id) }) {
                    ListRow(d.fileName, "${SOURCE[d.source] ?: "Fichier"} · ${formatSize(d.fileSize)} · ${DOC_STATUS[d.processingStatus]}${if (d.localPath != null) " · Hors ligne" else ""}", Icons.Outlined.Description)
                }
            }
            item {
                SectionTitle("Organisation")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    SecondaryButton("Sous-dossier", { dialog = "folder" }, icon = Icons.Outlined.CreateNewFolder)
                    SecondaryButton("Leçon", { dialog = "lesson" }, icon = Icons.Outlined.PostAdd)
                    SecondaryButton("Note", onNewNote, icon = Icons.Outlined.NoteAdd)
                }
            }
            if (subfolders.isNotEmpty()) item { SectionTitle("Sous-dossiers") }
            items(subfolders, key = { it.id }) { f ->
                val n = lessons.count { it.folderId == f.id }
                SmCard(onClick = { onFolder(f.id) }) {
                    Row { Icon(Icons.Outlined.Folder, null, tint = SM.Crimson); Spacer(Modifier.padding(6.dp)); Column { Text(f.name, style = MaterialTheme.typography.titleSmall); Text("$n leçon(s)", style = MaterialTheme.typography.bodySmall) } }
                }
            }
            if (here.isNotEmpty()) item { SectionTitle("Leçons") }
            items(here, key = { it.id }) { l ->
                SmCard(onClick = { onLesson(l.id) }) {
                    Row {
                        Icon(if (l.status == "COMPLETED") Icons.Outlined.CheckCircle else if (l.status == "IN_PROGRESS") Icons.Outlined.TaskAlt else Icons.Outlined.Circle, null, tint = if (l.status == "COMPLETED") SM.Success else SM.Muted)
                        Spacer(Modifier.padding(6.dp))
                        Text(l.title, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
            item { HorizontalDivider(color = SM.Border) }
        }
    }
    when (dialog) {
        "folder" -> NameDialog("Nouveau sous-dossier", "Nom du sous-dossier", { dialog = null }) { name -> dialog = null; scope.launch { c.study.createFolder(courseId, folderId, name) } }
        "lesson" -> NameDialog("Nouvelle leçon", "Titre de la leçon", { dialog = null }) { title -> dialog = null; scope.launch { onLesson(c.study.createLesson(courseId, folderId, title)) } }
    }
}
