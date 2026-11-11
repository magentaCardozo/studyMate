package com.studymateai.feature.update

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.studymateai.core.designsystem.SM
import com.studymateai.core.update.UpdateInfo
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatSize
import kotlinx.coroutines.launch
import java.io.File

/**
 * Vérifie les mises à jour au lancement et à chaque retour dans l'application (si connecté), et
 * propose l'installation dès qu'une nouvelle version est détectée. « Plus tard » : la même version
 * n'est plus proposée automatiquement pendant cette session (elle reste disponible dans le profil).
 */
@Composable
fun UpdateWatcher() {
    val c = container()
    val online by c.isOnline.collectAsState()
    val available by c.updates.available.collectAsState()
    var checks by remember { mutableStateOf(0) }
    LifecycleResumeEffect(Unit) {
        checks++
        onPauseOrDispose { }
    }
    LaunchedEffect(online, checks) {
        if (online) runCatching { c.updates.check() }
    }
    val info = available
    if (info != null && c.updates.postponedVersion != info.versionCode) {
        UpdateDialog(info, onDismiss = { c.updates.postponedVersion = info.versionCode; checks++ })
    }
}

private sealed interface Step {
    data object Ask : Step
    data class Downloading(val progress: Float) : Step
    data class Ready(val file: File) : Step
    data object NeedsPermission : Step
    data class Failed(val message: String) : Step
}

/** Fenêtre de mise à jour : téléchargement vérifié puis installateur d'Android. */
@Composable
fun UpdateDialog(info: UpdateInfo, onDismiss: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf<Step>(Step.Ask) }
    var progress by remember { mutableFloatStateOf(0f) }
    var pending by remember { mutableStateOf<File?>(null) }

    fun installOrAsk(file: File) {
        pending = file
        if (c.updates.canInstall()) {
            c.updates.install(file)
            step = Step.Ready(file)
        } else {
            step = Step.NeedsPermission
        }
    }
    fun start() = scope.launch {
        step = Step.Downloading(0f)
        try {
            val file = c.updates.download(info) { progress = it }
            installOrAsk(file)
        } catch (e: Exception) {
            step = Step.Failed(e.message ?: "Téléchargement impossible.")
        }
    }
    // Retour des réglages « Installer des applications inconnues » : on reprend l'installation.
    LifecycleResumeEffect(step) {
        if (step == Step.NeedsPermission && c.updates.canInstall()) pending?.let { installOrAsk(it) }
        onPauseOrDispose { }
    }

    val busy = step is Step.Downloading
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = SM.White,
        title = { Text("Mise à jour disponible") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("StudyMate AI ${info.versionName} est disponible (version installée : ${c.updates.currentVersionName}).", style = MaterialTheme.typography.bodyMedium)
                info.notes?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                Text("Taille : ${formatSize(info.size)}. Vos données sont conservées.", style = MaterialTheme.typography.bodySmall)
                when (val s = step) {
                    is Step.Downloading -> {
                        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth(), color = SM.Crimson, trackColor = SM.Border)
                        Text("Téléchargement… ${(progress * 100).toInt()} %", style = MaterialTheme.typography.bodySmall)
                    }
                    is Step.Ready -> Text("Fichier vérifié. Confirmez l’installation dans la fenêtre d’Android.", style = MaterialTheme.typography.bodySmall, color = SM.Success)
                    Step.NeedsPermission -> Text("Android demande d’autoriser StudyMate AI à installer ses mises à jour : activez « Autoriser cette source », puis revenez.", style = MaterialTheme.typography.bodySmall, color = SM.Warning)
                    is Step.Failed -> Text(s.message, style = MaterialTheme.typography.bodySmall, color = SM.Error)
                    Step.Ask -> Unit
                }
            }
        },
        confirmButton = {
            when (val s = step) {
                Step.Ask, is Step.Failed -> TextButton(onClick = { start() }) { Text(if (s is Step.Failed) "Réessayer" else "Mettre à jour", color = SM.Crimson) }
                Step.NeedsPermission -> TextButton(onClick = { c.updates.openInstallPermission() }) { Text("Autoriser", color = SM.Crimson) }
                is Step.Ready -> TextButton(onClick = { c.updates.install(s.file) }) { Text("Installer", color = SM.Crimson) }
                is Step.Downloading -> TextButton(onClick = {}, enabled = false) { Text("Téléchargement…") }
            }
        },
        dismissButton = { if (!busy) TextButton(onClick = onDismiss) { Text("Plus tard") } },
    )
}
