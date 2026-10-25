package com.studymateai.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.ListRow
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ScreenPadding
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.designsystem.SectionTitle
import com.studymateai.core.designsystem.SmCard
import com.studymateai.core.network.OverviewDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatSize
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/** Profil : synchronisation, bibliothèque hors ligne, préférences, progression, confidentialité. */
@Composable
fun ProfileScreen(onDocument: (String) -> Unit, onLoggedOut: () -> Unit) {
    val c = container()
    val scope = rememberCoroutineScope()
    val name by c.prefs.userName.collectAsState(null)
    val email by c.prefs.userEmail.collectAsState(null)
    val wifiOnly by c.prefs.wifiOnly.collectAsState(true)
    val lastSync by c.prefs.lastSyncAt.collectAsState(null)
    val syncError by c.prefs.lastSyncError.collectAsState(null)
    val conflict by c.prefs.lastConflict.collectAsState(null)
    val pending by c.study.pendingCount().collectAsState(0)
    val downloads by c.documents.downloaded().collectAsState(emptyList())
    val online by c.isOnline.collectAsState()
    var syncing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var overview by remember { mutableStateOf<OverviewDto?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    LaunchedEffect(online) { if (online) overview = runCatching { c.online.overview() }.getOrNull() }

    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            SectionTitle("Profil")
            Text(name ?: "", style = MaterialTheme.typography.titleMedium)
            Text(email ?: "", style = MaterialTheme.typography.bodySmall)
        }
        item {
            SmCard {
                Text("Synchronisation", style = MaterialTheme.typography.titleSmall)
                Text(lastSync?.let { "Dernière synchronisation : " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it)) } ?: "Jamais synchronisé", style = MaterialTheme.typography.bodySmall)
                Text(if (pending == 0) "Toutes vos modifications sont envoyées." else "$pending modification(s) en attente d’envoi.", style = MaterialTheme.typography.bodySmall)
                syncError?.let { Notice("Échec de la dernière synchronisation : $it", SM.Error) }
                conflict?.let { Notice(it) }
                message?.let { Text(it, color = SM.Success, style = MaterialTheme.typography.bodySmall) }
                SecondaryButton(if (syncing) "Synchronisation…" else "Synchroniser maintenant", {
                    syncing = true; message = null
                    scope.launch {
                        try { val r = c.sync.sync(); message = "Synchronisé : ${r.applied} envoi(s), ${r.pulled} mise(s) à jour reçue(s)." }
                        catch (e: Exception) { c.prefs.syncFailed(e.toUserMessage()) } finally { syncing = false }
                    }
                }, icon = Icons.Outlined.Sync, enabled = online && !syncing)
            }
        }
        overview?.let { o ->
            item {
                SmCard {
                    Text("Progression (données réelles)", style = MaterialTheme.typography.titleSmall)
                    Text("Leçons terminées : ${o.lessons.completed} / ${o.lessons.total}", style = MaterialTheme.typography.bodyMedium)
                    Text("Moyenne aux quiz (30 j) : ${o.quizzes.averageLast30Days?.let { "$it %" } ?: "—"}", style = MaterialTheme.typography.bodyMedium)
                    Text("Cartes maîtrisées : ${o.flashcards.mastered} / ${o.flashcards.total}", style = MaterialTheme.typography.bodyMedium)
                    Text("Sessions faites (30 j) : ${o.sessions.completedLast30Days} / ${o.sessions.plannedLast30Days}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        item {
            SmCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                        Text("Téléchargements en Wi-Fi uniquement", style = MaterialTheme.typography.titleSmall)
                        Text("Évite de consommer vos données mobiles.", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(wifiOnly, { scope.launch { c.prefs.setWifiOnly(it) } }, colors = SwitchDefaults.colors(checkedTrackColor = SM.Crimson))
                }
            }
        }
        item {
            SectionTitle("Bibliothèque hors ligne")
            Text("Espace utilisé : ${formatSize(downloads.sumOf { it.fileSize })}", style = MaterialTheme.typography.bodySmall)
        }
        if (downloads.isEmpty()) item { Text("Aucun document téléchargé. Ouvrez un document puis « Télécharger ».", style = MaterialTheme.typography.bodySmall) }
        items(downloads, key = { it.id }) { d -> SmCard(onClick = { onDocument(d.id) }) { ListRow(d.fileName, formatSize(d.fileSize), Icons.Outlined.Description) } }
        item {
            SmCard {
                Text("Confidentialité", style = MaterialTheme.typography.titleSmall)
                Text("Vos jetons de connexion sont chiffrés par le Keystore Android. Les documents téléchargés restent dans l’espace privé de l’application et sont effacés à la déconnexion. Le consentement au traitement par un fournisseur d’IA se gère depuis la version web (Paramètres › Confidentialité).", style = MaterialTheme.typography.bodySmall)
            }
        }
        item { SecondaryButton("Se déconnecter", { confirmLogout = true }, Modifier.fillMaxWidth(), icon = Icons.Outlined.Logout) }
    }
    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        containerColor = SM.White,
        title = { Text("Se déconnecter ?") },
        text = { Text(if (pending > 0) "$pending modification(s) n’ont pas encore été synchronisées et seront perdues. Les documents téléchargés seront effacés de l’appareil." else "Les données et documents hors ligne seront effacés de l’appareil.") },
        confirmButton = { TextButton(onClick = { scope.launch { c.auth.logout(); onLoggedOut() } }) { Text("Se déconnecter", color = SM.Error) } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Annuler") } },
    )
}
