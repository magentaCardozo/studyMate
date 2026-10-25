package com.studymateai.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Système de design StudyMate AI — mêmes jetons que le client web. */
object SM {
    val Crimson = Color(0xFFA51C30)
    val CrimsonDark = Color(0xFF7F1425)
    val CrimsonSoft = Color(0xFFF6E8EA)
    val Ivory = Color(0xFFF7F4ED)
    val White = Color(0xFFFFFFFF)
    val Charcoal = Color(0xFF1F2937)
    val Muted = Color(0xFF6B7280)
    val Border = Color(0xFFE5E7EB)
    val Success = Color(0xFF287D55)
    val Warning = Color(0xFFB7791F)
    val Error = Color(0xFFB42318)
}

private val colors = lightColorScheme(
    primary = SM.Crimson,
    onPrimary = SM.White,
    primaryContainer = SM.CrimsonSoft,
    onPrimaryContainer = SM.CrimsonDark,
    secondary = SM.Charcoal,
    onSecondary = SM.White,
    background = SM.Ivory,
    onBackground = SM.Charcoal,
    surface = SM.White,
    onSurface = SM.Charcoal,
    surfaceVariant = SM.Ivory,
    onSurfaceVariant = SM.Muted,
    surfaceContainer = SM.White,
    surfaceContainerLow = SM.White,
    outline = SM.Border,
    outlineVariant = SM.Border,
    error = SM.Error,
)

private val Serif = FontFamily.Serif
private val Sans = FontFamily.SansSerif

private val typography = Typography(
    headlineLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 23.sp),
    titleSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 21.sp),
    bodyLarge = TextStyle(fontFamily = Sans, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Sans, fontSize = 15.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontFamily = Sans, fontSize = 13.sp, lineHeight = 18.sp, color = SM.Muted),
    labelLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 12.sp),
)

private val shapes = Shapes(small = RoundedCornerShape(6.dp), medium = RoundedCornerShape(10.dp), large = RoundedCornerShape(12.dp))

@Composable
fun StudyMateTheme(content: @Composable () -> Unit) {
    // Identité claire ivoire / cramoisi sur toutes les configurations (thème sombre : évolution future).
    @Suppress("UNUSED_VARIABLE") val dark = isSystemInDarkTheme()
    MaterialTheme(colorScheme = colors, typography = typography, shapes = shapes, content = content)
}
