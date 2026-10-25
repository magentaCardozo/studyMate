package com.studymateai.feature.documents

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Loading
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.designsystem.StatusChip
import com.studymateai.core.network.ApiException
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.DOC_STATUS
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatSize
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun DocumentScreen(documentId: String, onBack: () -> Unit) {
    val c = container()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val doc by c.documents.observe(documentId).collectAsState(null)
    val online by c.isOnline.collectAsState()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var wifiBlocked by remember { mutableStateOf(false) }
    val d = doc

    fun open(path: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", File(path))
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, d!!.mimeType).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { context.startActivity(intent) } catch (_: ActivityNotFoundException) { error = "Aucune application ne permet d’ouvrir ce type de fichier sur l’appareil." }
    }

    fun download(force: Boolean) {
        busy = true; error = null; wifiBlocked = false
        scope.launch {
            try { c.documents.download(d!!, force) } catch (e: Exception) {
                if (e is ApiException && e.code == "WIFI_ONLY") wifiBlocked = true
                error = e.toUserMessage()
            } finally { busy = false }
        }
    }

    Column {
        BackBar(d?.fileName ?: "Document", onBack)
        if (d == null) { Loading(); return@Column }
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text(d.fileName, style = MaterialTheme.typography.headlineMedium)
                Text("${formatSize(d.fileSize)}${d.pageCount?.let { " · $it pages" } ?: ""}", style = MaterialTheme.typography.bodySmall)
                StatusChip(DOC_STATUS[d.processingStatus] ?: d.processingStatus, if (d.processingStatus == "READY") SM.Success else if (d.processingStatus == "FAILED") SM.Error else SM.Warning)
            }
            d.processingError?.let { item { Notice(it) } }
            item {
                if (d.localPath != null && File(d.localPath).exists()) {
                    SmCard {
                        Text("Disponible hors ligne", style = MaterialTheme.typography.titleSmall.copy(color = SM.Success))
                        PrimaryButton("Ouvrir", { open(d.localPath) }, Modifier.fillMaxWidth(), icon = Icons.Outlined.OpenInNew)
                        SecondaryButton("Retirer de l’appareil", { scope.launch { c.documents.removeDownload(d) } }, icon = Icons.Outlined.DeleteOutline)
                    }
                } else {
                    SmCard {
                        Text("Rendre disponible hors ligne", style = MaterialTheme.typography.titleSmall)
                        Text("Taille estimée : ${formatSize(d.fileSize)}", style = MaterialTheme.typography.bodySmall)
                        PrimaryButton("Télécharger", { download(false) }, Modifier.fillMaxWidth(), loading = busy, enabled = online, icon = Icons.Outlined.CloudDownload)
                        if (!online) Text("Connexion requise pour télécharger.", style = MaterialTheme.typography.bodySmall)
                        if (wifiBlocked) SecondaryButton("Télécharger quand même (données mobiles)", { download(true) })
                    }
                }
            }
            error?.let { item { ErrorState(it) } }
            item { SectionTitle("Texte extrait") }
            item {
                SmCard {
                    when {
                        d.cachedText != null -> Text(d.cachedText, style = MaterialTheme.typography.bodyMedium)
                        d.processingStatus != "READY" -> Text("Le texte sera disponible à la fin de l’analyse.", style = MaterialTheme.typography.bodySmall)
                        online -> SecondaryButton("Afficher le texte", { scope.launch { runCatching { c.documents.cacheText(d.id) }.onFailure { error = it.toUserMessage() } } })
                        else -> Text("Texte non téléchargé. Connectez-vous pour l’afficher.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
