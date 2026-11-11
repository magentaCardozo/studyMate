package com.studymateai.feature.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.studymateai.core.designsystem.BandHeader
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.ThemeMode
import com.studymateai.core.network.OverviewDto
import com.studymateai.core.network.toUserMessage
import com.studymateai.core.update.UpdateInfo
import com.studymateai.feature.common.container
import com.studymateai.feature.common.formatSize
import com.studymateai.feature.update.UpdateDialog
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/** Profil : identité, progression, synchronisation, préférences, application, bibliothèque, confidentialité. */
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
    val theme by c.prefs.theme.collectAsState(ThemeMode.SYSTEM)
    var syncing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var overview by remember { mutableStateOf<OverviewDto?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var updateMessage by remember { mutableStateOf<String?>(null) }
    var updateError by remember { mutableStateOf<String?>(null) }
    var showUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    LaunchedEffect(online) { if (online) overview = runCatching { c.online.overview() }.getOrNull() }

    val syncLabel = when {
        !online -> "Hors connexion"
        pending > 0 -> "$pending modification${if (pending > 1) "s" else ""} en attente"
        lastSync != null -> "Synchronisé à " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(lastSync!!))
        else -> "Jamais synchronisé"
    }

    Column {
    BandHeader("Profil")
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        // Identité : carte sous la bande (la bande garde la même hauteur que sur les autres pages).
        item {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                Group {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(56.dp).background(SM.Crimson, CircleShape), contentAlignment = Alignment.Center) {
                            Text(initials(name, email), style = MaterialTheme.typography.titleLarge, color = SM.OnCrimson)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(name ?: "", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(email ?: "", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(6.dp))
                            val tone = if (!online) SM.Muted else if (pending > 0) SM.Warning else SM.Success
                            Row(Modifier.background(tone.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(if (!online) Icons.Outlined.CloudOff else if (pending > 0) Icons.Outlined.CloudUpload else Icons.Outlined.CloudDone, null, tint = tone, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(5.dp))
                                Text(syncLabel, style = MaterialTheme.typography.labelMedium, color = tone)
                            }
                        }
                    }
                }
            }
        }

        // Progression (données réelles du serveur)
        overview?.let { o ->
            item {
                Section("Progression") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Stat(o.quizzes.averageLast30Days?.let { "$it %" } ?: "—", "moyenne aux QCM (30 j)", Modifier.weight(1f))
                        Stat("${o.flashcards.mastered}/${o.flashcards.total}", "cartes maîtrisées", Modifier.weight(1f))
                        Stat("${o.sessions.completedLast30Days}/${o.sessions.plannedLast30Days}", "sessions faites (30 j)", Modifier.weight(1f))
                    }
                }
            }
        }

        // Synchronisation
        item {
            Section("Synchronisation") {
                Group {
                    SettingRow(
                        Icons.Outlined.Sync,
                        if (syncing) "Synchronisation…" else "Synchroniser maintenant",
                        lastSync?.let { "Dernière : " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it)) } ?: "Jamais synchronisé",
                        onClick = if (online && !syncing) ({
                            syncing = true; message = null
                            scope.launch {
                                try { val r = c.sync.sync(); message = "Synchronisé : ${r.applied} envoi(s), ${r.pulled} mise(s) à jour reçue(s)." }
                                catch (e: Exception) { c.prefs.syncFailed(e.toUserMessage()) } finally { syncing = false }
                            }
                        }) else null,
                    ) {
                        Text(if (pending == 0) "À jour" else "$pending en attente", style = MaterialTheme.typography.labelMedium, color = if (pending == 0) SM.Success else SM.Warning)
                    }
                }
                syncError?.let { Spacer(Modifier.height(8.dp)); Notice("Échec de la dernière synchronisation : $it", SM.Error) }
                conflict?.let { Spacer(Modifier.height(8.dp)); Notice(it) }
                message?.let { Text(it, color = SM.Success, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp, start = 4.dp)) }
            }
        }

        // Préférences
        item {
            Section("Préférences") {
                Group {
                    SettingRow(Icons.Outlined.Wifi, "Wi-Fi uniquement", "Téléchargements sans données mobiles.") {
                        Switch(wifiOnly, { scope.launch { c.prefs.setWifiOnly(it) } }, colors = SwitchDefaults.colors(checkedTrackColor = SM.Crimson, checkedThumbColor = SM.OnCrimson))
                    }
                    HorizontalDivider(color = SM.Border)
                    SettingRow(Icons.Outlined.Palette, "Apparence", "Thème de l’application sur cet appareil.")
                    // Choix du thème : comme le système, clair ou sombre (appliqué immédiatement).
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp)) {
                        ThemeMode.entries.forEach { mode ->
                            val active = mode == theme
                            Surface(
                                onClick = { scope.launch { c.prefs.setTheme(mode) } },
                                shape = RoundedCornerShape(10.dp),
                                color = if (active) SM.CrimsonSoft else SM.Ivory,
                                border = BorderStroke(if (active) 1.5.dp else 1.dp, if (active) SM.Crimson else SM.Border),
                                modifier = Modifier.weight(1f).semantics { selected = active; role = Role.RadioButton },
                            ) {
                                Column(Modifier.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(
                                        when (mode) { ThemeMode.SYSTEM -> Icons.Outlined.PhoneAndroid; ThemeMode.LIGHT -> Icons.Outlined.LightMode; ThemeMode.DARK -> Icons.Outlined.DarkMode },
                                        null, tint = if (active) SM.Crimson else SM.Muted, modifier = Modifier.size(20.dp),
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(if (mode == ThemeMode.SYSTEM) "Système" else mode.label, style = MaterialTheme.typography.labelLarge, color = if (active) SM.Crimson else SM.Charcoal)
                                }
                            }
                        }
                    }
                }
            }
        }

        // Application
        item {
            Section("Application") {
                Group {
                    SettingRow(
                        Icons.Outlined.SystemUpdate,
                        if (checking) "Recherche…" else "Rechercher une mise à jour",
                        "Version installée : ${c.updates.currentVersionName}",
                        onClick = if (online && !checking) ({
                            checking = true; updateMessage = null; updateError = null
                            scope.launch {
                                try {
                                    val info = c.updates.check()
                                    if (info != null) showUpdate = info else updateMessage = "Vous avez la dernière version."
                                } catch (e: Exception) {
                                    updateError = e.message ?: "Vérification impossible pour le moment."
                                } finally { checking = false }
                            }
                        }) else null,
                    )
                }
                updateMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = SM.Success, modifier = Modifier.padding(top = 8.dp, start = 4.dp)) }
                updateError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = SM.Error, modifier = Modifier.padding(top = 8.dp, start = 4.dp)) }
            }
        }

        // Bibliothèque hors ligne
        item {
            Section("Bibliothèque hors ligne", trailing = if (downloads.isNotEmpty()) formatSize(downloads.sumOf { it.fileSize }) else null) {
                Group {
                    if (downloads.isEmpty()) {
                        SettingRow(Icons.Outlined.Description, "Aucun document téléchargé", "Ouvrez un document puis « Télécharger » pour le lire sans connexion.")
                    }
                    downloads.forEachIndexed { i, d ->
                        if (i > 0) HorizontalDivider(color = SM.Border)
                        SettingRow(Icons.Outlined.Description, d.fileName, formatSize(d.fileSize), onClick = { onDocument(d.id) })
                    }
                }
            }
        }

        // Confidentialité
        item {
            Section("Confidentialité") {
                Group {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
                        IconTile(Icons.Outlined.Lock)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "Vos jetons de connexion sont chiffrés par le Keystore Android. Les documents téléchargés restent dans l’espace privé de l’application et sont effacés à la déconnexion. Le consentement au traitement par un fournisseur d’IA se gère depuis la version web (Paramètres › Confidentialité).",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }

        // Déconnexion
        item {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp)) {
                Surface(onClick = { confirmLogout = true }, shape = RoundedCornerShape(12.dp), color = SM.White, border = BorderStroke(1.dp, SM.Border), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = SM.Error, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Se déconnecter", style = MaterialTheme.typography.labelLarge, color = SM.Error)
                    }
                }
            }
        }
    }

    }
    showUpdate?.let { info -> UpdateDialog(info, onDismiss = { showUpdate = null }) }
    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        containerColor = SM.White,
        title = { Text("Se déconnecter ?") },
        text = { Text(if (pending > 0) "$pending modification(s) n’ont pas encore été synchronisées et seront perdues. Les documents téléchargés seront effacés de l’appareil." else "Les données et documents hors ligne seront effacés de l’appareil.") },
        confirmButton = { TextButton(onClick = { scope.launch { c.auth.logout(); onLoggedOut() } }) { Text("Se déconnecter", color = SM.Error) } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Annuler") } },
    )
}

/** Initiales affichées dans l'avatar (nom, sinon partie locale de l'adresse e-mail). */
private fun initials(name: String?, email: String?): String {
    val source = name?.takeIf { it.isNotBlank() } ?: email?.substringBefore('@') ?: "?"
    return source.split(' ', '.', '-', '_').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
}

/** Section du profil : petit intitulé en capitales puis son contenu. */
@Composable
private fun Section(title: String, trailing: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = SM.Muted, modifier = Modifier.weight(1f))
            trailing?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = SM.Muted) }
        }
        content()
    }
}

/** Carte regroupant des lignes de réglages séparées par des filets. */
@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = SM.White, border = BorderStroke(1.dp, SM.Border), modifier = Modifier.fillMaxWidth()) {
        Column(content = content)
    }
}

@Composable
private fun IconTile(icon: ImageVector) {
    Box(Modifier.size(36.dp).background(SM.CrimsonSoft, RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = SM.Crimson, modifier = Modifier.size(19.dp))
    }
}

/** Ligne de réglage : icône, titre, description et élément de fin (interrupteur, état ou flèche). */
@Composable
private fun SettingRow(icon: ImageVector, title: String, subtitle: String? = null, onClick: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(icon)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
        when {
            trailing != null -> { Spacer(Modifier.width(8.dp)); trailing() }
            onClick != null -> Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = SM.Muted)
        }
    }
}

/** Chiffre clé de progression. */
@Composable
private fun Stat(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = SM.White, border = BorderStroke(1.dp, SM.Border), modifier = modifier) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 14.dp)) {
            Text(value, style = MaterialTheme.typography.titleLarge, color = SM.Crimson, maxLines = 1)
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 2, minLines = 2)
        }
    }
}
