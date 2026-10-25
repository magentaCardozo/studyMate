package com.studymateai.feature.documents

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.network.KnowledgeBaseDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.container
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/** Copie le PDF choisi dans le cache privé de l'application avant l'envoi. */
private suspend fun copyToCache(context: Context, uri: Uri): Pair<File, String> = withContext(Dispatchers.IO) {
    val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
    } ?: "document.pdf"
    val target = File(File(context.cacheDir, "scans").apply { mkdirs() }, "import-${UUID.randomUUID()}.pdf")
    context.contentResolver.openInputStream(uri)!!.use { input -> target.outputStream().use { input.copyTo(it) } }
    target to (if (name.endsWith(".pdf", true)) name else "$name.pdf")
}

/**
 * Base de connaissances d'un dossier : état, trois modes d'ajout (PDF, scan, texte collé)
 * et accès à la génération (QCM, fiches de révision, cartes mémoire).
 */
@Composable
fun KnowledgeBaseSection(courseId: String, folderId: String?, localDocuments: Int, onScan: () -> Unit, onGenerate: (String) -> Unit) {
    val c = container()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    var stats by remember { mutableStateOf<KnowledgeBaseDto?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var pasting by remember { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }

    LaunchedEffect(courseId, online, refresh) {
        if (!online) return@LaunchedEffect
        // Un dossier créé sur l'appareil doit exister sur le serveur avant d'y ajouter des documents.
        runCatching { c.sync.sync() }
        stats = runCatching { c.documents.knowledgeBase(courseId) }.getOrNull()
    }

    val pickPdf = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true; error = null; message = null
        scope.launch {
            try {
                runCatching { c.sync.sync() }
                val (file, name) = copyToCache(context, uri)
                c.documents.uploadPdf(file, name, courseId, folderId, source = "file")
                file.delete()
                message = "« $name » ajouté à la base : analyse en cours."
                runCatching { c.sync.sync() }
                refresh++
            } catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle("Base de connaissances")
        val s = stats
        Text(
            when {
                s != null && s.documents == 0 -> "Vide : ajoutez au moins un document pour pouvoir générer des révisions."
                s != null -> "${s.documents} document(s) · ${s.ready} prêt(s)${if (s.processing > 0) " · ${s.processing} en cours d’analyse" else ""}${if (s.failed > 0) " · ${s.failed} en échec" else ""}"
                else -> "$localDocuments document(s) enregistré(s) sur l’appareil."
            },
            style = MaterialTheme.typography.bodySmall,
        )
        if (!online) Notice("L’ajout de documents et la génération nécessitent une connexion.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            SecondaryButton("PDF", { pickPdf.launch(arrayOf("application/pdf")) }, icon = Icons.Outlined.PictureAsPdf, enabled = online && !busy)
            SecondaryButton("Scanner", onScan, icon = Icons.Outlined.DocumentScanner, enabled = online && !busy)
            SecondaryButton("Texte", { pasting = true }, icon = Icons.Outlined.ContentPaste, enabled = online && !busy)
        }
        if (busy) Text("Envoi en cours…", style = MaterialTheme.typography.bodySmall)
        message?.let { Text(it, color = SM.Success, style = MaterialTheme.typography.bodySmall) }
        error?.let { ErrorState(it) }

        SectionTitle("Réviser à partir de cette base")
        val canGenerate = online && (s?.canGenerate ?: (localDocuments > 0))
        if (!canGenerate && online) Text("Ajoutez au moins un document lisible pour générer un QCM ou des fiches.", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SecondaryButton("QCM", { onGenerate("qcm") }, enabled = canGenerate)
            SecondaryButton("Fiches", { onGenerate("summary") }, enabled = canGenerate)
            SecondaryButton("Cartes", { onGenerate("flashcards") }, enabled = canGenerate)
        }
    }

    if (pasting) PasteTextDialog(courseId, folderId, onDismiss = { pasting = false }) { title ->
        pasting = false
        message = "« $title » ajouté à la base : analyse en cours."
        scope.launch { runCatching { c.sync.sync() }; refresh++ }
    }
}

@Composable
private fun PasteTextDialog(courseId: String, folderId: String?, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val tooShort = content.count { !it.isWhitespace() } < 20
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = SM.White,
        title = { Text("Coller du texte") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Extrait de cours, notes ou transcription : le texte rejoint la base de connaissances du dossier.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(title, { title = it }, label = { Text("Titre") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(content, { content = it }, label = { Text("Texte") }, modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp))
                Text("${content.length} / 500 000 caractères", style = MaterialTheme.typography.bodySmall)
                error?.let { ErrorState(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && !tooShort && content.length <= 500_000, onClick = {
                busy = true; error = null
                val finalTitle = title.trim().ifBlank { "Texte collé" }
                scope.launch {
                    try { runCatching { c.sync.sync() }; c.documents.pasteText(finalTitle, content, courseId, folderId); onDone(finalTitle) }
                    catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
                }
            }) { Text(if (busy) "Ajout…" else "Ajouter à la base", color = SM.Crimson) }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Annuler") } },
    )
}
