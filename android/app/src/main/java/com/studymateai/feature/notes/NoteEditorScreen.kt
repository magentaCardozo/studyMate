package com.studymateai.feature.notes

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.SM
import com.studymateai.feature.common.container
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Éditeur de note disponible hors ligne : sauvegarde automatique locale (Room),
 * synchronisée ensuite avec détection de conflit.
 */
@Composable
fun NoteEditorScreen(noteId: String?, courseId: String?, lessonId: String?, onBack: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    var id by remember { mutableStateOf(noteId) }
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(noteId == null) }
    var status by remember { mutableStateOf("") }
    var dirty by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(noteId) {
        noteId?.let { c.study.note(it) }?.let { title = it.title; content = it.content }
        loaded = true
    }
    // Sauvegarde automatique 1,5 s après la dernière frappe.
    LaunchedEffect(title, content) {
        if (!loaded || !dirty) return@LaunchedEffect
        status = "Modification…"
        delay(1500)
        id = c.study.saveNote(id, title.ifBlank { "Note sans titre" }, content, courseId, lessonId)
        dirty = false
        status = "Enregistré sur l’appareil"
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        BackBar("Note", onBack) {
            if (id != null) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Outlined.Delete, "Supprimer la note") }
        }
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(status, style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(title, { title = it; dirty = true }, label = { Text("Titre") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                content, { content = it; dirty = true },
                label = { Text("Contenu (Markdown, maths entre $…$)") },
                modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 8.dp, bottom = 16.dp),
            )
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Supprimer la note ?") },
        text = { Text("Cette note sera définitivement supprimée.") },
        confirmButton = { TextButton(onClick = { scope.launch { id?.let { c.study.deleteNote(it) }; onBack() } }) { Text("Supprimer", color = SM.Error) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Annuler") } },
        containerColor = SM.White,
    )
}
