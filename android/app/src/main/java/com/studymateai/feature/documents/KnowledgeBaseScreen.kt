package com.studymateai.feature.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.BandHeader
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.network.KbContentDto
import com.studymateai.core.network.KbPageDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.SOURCE
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatDate

private const val IMAGE_TEXT_HEADER = "[Texte lu dans une image — OCR, à vérifier]"

/**
 * Base de connaissances d'un dossier : le texte extrait de tous ses documents (fichiers, scans,
 * textes collés), réuni au même endroit. C'est le contenu utilisé par « Générer ».
 */
@Composable
fun KnowledgeBaseScreen(courseId: String, onBack: () -> Unit) {
    val c = container()
    val online by c.isOnline.collectAsState()
    var kb by remember { mutableStateOf<KbContentDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(courseId, online) {
        if (!online) return@LaunchedEffect
        try { kb = c.documents.knowledgeBaseContent(courseId); error = null } catch (e: Exception) { error = e.toUserMessage() }
    }
    Column {
        BandHeader("Base de connaissances", onBack = onBack)
        LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val data = kb
            item {
                Text(
                    if (data != null) "« ${data.title} » · ${data.documents.size} document(s) · ${"%,d".format(data.characters).replace(',', ' ')} caractères" else "Texte extrait de tous les documents du dossier.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (!online && data == null) item { Notice("Connexion requise pour afficher la base de connaissances.") }
            error?.let { e -> item { ErrorState(e) } }
            if (data != null && data.pending.isNotEmpty()) item { Text("Non inclus pour l’instant (analyse en cours ou en échec) : ${data.pending.joinToString { it.fileName }}", style = MaterialTheme.typography.bodySmall, color = SM.Warning) }
            if (data != null && data.documents.isEmpty()) item { Text("Base vide : ajoutez des PDF, des scans ou du texte dans le dossier.", style = MaterialTheme.typography.bodyMedium) }
            data?.documents.orEmpty().forEachIndexed { i, d ->
                item(key = d.id) {
                    SmCard {
                        Text("${i + 1}. ${d.fileName}", style = MaterialTheme.typography.titleSmall)
                        Text(
                            listOfNotNull(SOURCE[d.source] ?: d.source, d.pageCount?.let { "$it page(s)" }, "ajouté le ${formatDate(d.createdAt)}", if (d.corrected) "texte corrigé" else null).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (d.pages.isEmpty()) Text("Aucun texte lisible dans ce document.", style = MaterialTheme.typography.bodySmall)
                        d.pages.forEach { p -> PageBlock(p) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PageBlock(p: KbPageDto) {
    Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (p.page != null) {
            Text("PAGE ${p.page}" + if (p.source == "ocr") " · OCR, à vérifier" else "", style = MaterialTheme.typography.labelMedium, color = if (p.source == "ocr") SM.Warning else SM.Muted)
        }
        val main = if (p.texteImages != null) p.text.substringBefore(IMAGE_TEXT_HEADER).trim() else p.text
        Text(main, style = MaterialTheme.typography.bodyMedium)
        p.texteImages?.let { img ->
            Column(Modifier.fillMaxWidth().background(SM.Warning.copy(alpha = 0.08f), RoundedCornerShape(8.dp)).padding(10.dp)) {
                Text("Texte lu dans une image de la page (OCR, à vérifier)", style = MaterialTheme.typography.labelMedium, color = SM.Warning)
                Text(img, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (p.aVerifier.isNotEmpty()) Text("Nombres à vérifier : ${p.aVerifier.joinToString()}", style = MaterialTheme.typography.bodySmall, color = SM.Warning)
    }
}
