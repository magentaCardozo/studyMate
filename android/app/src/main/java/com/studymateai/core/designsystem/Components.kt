package com.studymateai.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.studymateai.R

@Composable
fun Logo(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.size(30.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold, fontSize = 19.sp, color = SM.Charcoal)) { append("StudyMate") }
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, fontSize = 11.sp, color = SM.Crimson)) { append(" AI") }
            },
            modifier = Modifier.semantics { contentDescription = "StudyMate AI" },
        )
    }
}

@Composable
fun SmCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val m = modifier.fillMaxWidth()
    val colors = CardDefaults.cardColors(containerColor = SM.White)
    val border = BorderStroke(1.dp, SM.Border)
    if (onClick != null) Card(onClick = onClick, modifier = m, colors = colors, border = border, shape = RoundedCornerShape(10.dp)) { Column(Modifier.padding(16.dp), content = content) }
    else Card(modifier = m, colors = colors, border = border, shape = RoundedCornerShape(10.dp)) { Column(Modifier.padding(16.dp), content = content) }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
        action?.invoke()
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, loading: Boolean = false, enabled: Boolean = true, icon: ImageVector? = null) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = SM.Crimson, contentColor = SM.White),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = SM.White, strokeWidth = 2.dp)
        else icon?.let { Icon(it, null, Modifier.size(18.dp)) }
        if (loading || icon != null) Spacer(Modifier.width(8.dp))
        Text(text)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier.height(44.dp), shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, SM.Border), contentPadding = PaddingValues(horizontal = 14.dp)) {
        icon?.let { Icon(it, null, Modifier.size(17.dp), tint = SM.Charcoal); Spacer(Modifier.width(6.dp)) }
        Text(text, color = SM.Charcoal)
    }
}

@Composable
fun Loading(label: String = "Chargement…") {
    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(22.dp), color = SM.Crimson, strokeWidth = 2.5.dp)
            Spacer(Modifier.width(12.dp))
            Text(label, color = SM.Muted)
        }
    }
}

@Composable
fun EmptyState(title: String, description: String? = null, icon: ImageVector? = null, action: (@Composable () -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 32.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon?.let {
            Box(Modifier.size(48.dp).background(SM.CrimsonSoft, CircleShape), contentAlignment = Alignment.Center) { Icon(it, null, tint = SM.Crimson) }
        }
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        description?.let { Text(it, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center) }
        action?.let { Spacer(Modifier.height(4.dp)); it() }
    }
}

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().background(Color(0xFFFCEBEA), RoundedCornerShape(10.dp)).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.ErrorOutline, null, tint = SM.Error)
        Spacer(Modifier.height(6.dp))
        Text(message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
        onRetry?.let { TextButton(onClick = it) { Text("Réessayer", color = SM.Crimson) } }
    }
}

@Composable
fun Notice(text: String, tone: Color = SM.Warning) {
    Row(
        Modifier.fillMaxWidth().background(tone.copy(alpha = 0.10f), RoundedCornerShape(8.dp)).padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) { Text(text, style = MaterialTheme.typography.bodySmall.copy(color = SM.Charcoal)) }
}

@Composable
fun OfflineBanner() {
    Row(Modifier.fillMaxWidth().background(SM.Charcoal).padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.CloudOff, null, tint = SM.White, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(8.dp))
        Text("Hors connexion — vos modifications seront synchronisées plus tard.", color = SM.White, fontSize = 12.5.sp)
    }
}

@Composable
fun StatusChip(text: String, color: Color = SM.Muted) {
    Text(text, color = color, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.background(color.copy(alpha = 0.10f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
}

@Composable
fun ListRow(title: String, subtitle: String? = null, leading: ImageVector? = null, leadingTint: Color = SM.Muted, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.let { Icon(it, null, tint = leadingTint, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 2)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2) }
        }
        trailing?.invoke()
    }
}

/**
 * Rendu Markdown minimal (titres, listes, gras) pour les leçons et notes.
 * Les expressions mathématiques ($…$) sont affichées telles quelles sur Android.
 */
@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (raw in text.lines()) {
            val line = raw.trimEnd()
            when {
                line.isBlank() -> Spacer(Modifier.height(2.dp))
                line.startsWith("#") -> Text(line.trimStart('#').trim(), style = if (line.startsWith("##")) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge)
                line.trimStart().startsWith("- ") || line.trimStart().startsWith("* ") -> Row { Text("•  "); Text(inline(line.trimStart().drop(2)), style = MaterialTheme.typography.bodyMedium) }
                else -> Text(inline(line), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private fun inline(s: String) = buildAnnotatedString {
    val parts = s.split("**")
    parts.forEachIndexed { i, p -> if (i % 2 == 1) withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(p) } else append(p.replace("_", "")) }
}

val ScreenPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp)

@Composable
fun Screen(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(SM.Ivory), content = content)
}
