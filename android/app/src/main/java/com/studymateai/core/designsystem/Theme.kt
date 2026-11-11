package com.studymateai.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.studymateai.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Choix du thème dans le profil : comme le système, clair ou sombre. */
enum class ThemeMode(val label: String) { SYSTEM("Comme le système"), LIGHT("Clair"), DARK("Sombre") }

/**
 * Palette StudyMate AI. Les noms sont ceux du thème clair (mêmes jetons que le client web) :
 * en thème sombre, « White » désigne la surface des cartes, « Ivory » le fond et « Charcoal » le texte.
 */
@Immutable
data class SmPalette(
    val crimson: Color,
    val crimsonDark: Color,
    val crimsonSoft: Color,
    val ivory: Color,
    val white: Color,
    val charcoal: Color,
    val muted: Color,
    val border: Color,
    val success: Color,
    val warning: Color,
    val error: Color,
    val errorSoft: Color,
    /** Bande de couleur en haut de l'écran (zone de la barre d'état) et en-têtes. */
    val band: Color,
    val dark: Boolean,
)

val LightPalette = SmPalette(
    crimson = Color(0xFFA51C30),
    crimsonDark = Color(0xFF7F1425),
    crimsonSoft = Color(0xFFF6E8EA),
    ivory = Color(0xFFF7F4ED),
    white = Color(0xFFFFFFFF),
    charcoal = Color(0xFF1F2937),
    muted = Color(0xFF6B7280),
    border = Color(0xFFE5E7EB),
    success = Color(0xFF287D55),
    warning = Color(0xFFB7791F),
    error = Color(0xFFB42318),
    errorSoft = Color(0xFFFCEBEA),
    band = Color(0xFFA51C30),
    dark = false,
)

/** Thème sombre : fond anthracite chaud, cramoisi éclairci pour garder un contraste suffisant. */
val DarkPalette = SmPalette(
    crimson = Color(0xFFE05A6E),
    crimsonDark = Color(0xFFF08C9B),
    crimsonSoft = Color(0xFF3B2328),
    ivory = Color(0xFF141518),
    white = Color(0xFF1F2126),
    charcoal = Color(0xFFECE9E3),
    muted = Color(0xFFA2A7B0),
    border = Color(0xFF33363D),
    success = Color(0xFF5FC291),
    warning = Color(0xFFE3AA4F),
    error = Color(0xFFF2766B),
    errorSoft = Color(0xFF3A2220),
    band = Color(0xFF5C1420),
    dark = true,
)

val LocalSmPalette = staticCompositionLocalOf { LightPalette }

/** Couleurs du thème actif (clair ou sombre). */
object SM {
    val Crimson: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.crimson
    val CrimsonDark: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.crimsonDark
    val CrimsonSoft: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.crimsonSoft
    val Ivory: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.ivory
    val White: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.white
    val Charcoal: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.charcoal
    val Muted: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.muted
    val Border: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.border
    val Success: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.success
    val Warning: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.warning
    val Error: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.error
    val ErrorSoft: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.errorSoft
    val Band: Color @Composable @ReadOnlyComposable get() = LocalSmPalette.current.band

    /** Texte et icônes posés sur le cramoisi : blanc dans les deux thèmes. */
    val OnCrimson = Color(0xFFFFFFFF)
}

private fun colorScheme(p: SmPalette) = if (p.dark) {
    darkColorScheme(
        primary = p.crimson, onPrimary = SM.OnCrimson, primaryContainer = p.crimsonSoft, onPrimaryContainer = p.crimsonDark,
        secondary = p.charcoal, onSecondary = p.ivory, background = p.ivory, onBackground = p.charcoal,
        surface = p.white, onSurface = p.charcoal, surfaceVariant = p.white, onSurfaceVariant = p.muted,
        surfaceContainer = p.white, surfaceContainerLow = p.white, surfaceContainerHigh = p.white, surfaceContainerHighest = p.border,
        outline = p.border, outlineVariant = p.border, error = p.error,
    )
} else {
    lightColorScheme(
        primary = p.crimson, onPrimary = SM.OnCrimson, primaryContainer = p.crimsonSoft, onPrimaryContainer = p.crimsonDark,
        secondary = p.charcoal, onSecondary = p.white, background = p.ivory, onBackground = p.charcoal,
        surface = p.white, onSurface = p.charcoal, surfaceVariant = p.ivory, onSurfaceVariant = p.muted,
        surfaceContainer = p.white, surfaceContainerLow = p.white,
        outline = p.border, outlineVariant = p.border, error = p.error,
    )
}

/** Polices variables embarquées (res/font, licence OFL) : une instance par graisse utilisée. */
@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, vararg weights: Int) = FontFamily(
    weights.map { w -> Font(res, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w))) },
)

/** Titres : Newsreader (fine pour les grands titres, medium pour les petits). */
val Serif = variable(R.font.newsreader, 300, 400, 500, 600)

/** Texte : DM Sans. */
val Sans = variable(R.font.dm_sans, 400, 500, 600, 700)

private fun typography(p: SmPalette) = Typography(
    headlineLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Light, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.6).sp),
    headlineMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Normal, fontSize = 25.sp, lineHeight = 31.sp, letterSpacing = (-0.4).sp),
    titleLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 21.sp, lineHeight = 27.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 18.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 21.sp),
    bodyLarge = TextStyle(fontFamily = Sans, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Sans, fontSize = 15.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontFamily = Sans, fontSize = 13.sp, lineHeight = 18.sp, color = p.muted),
    labelLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
    headlineSmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.3).sp),
    displayLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Light, fontSize = 52.sp, lineHeight = 58.sp, letterSpacing = (-1.5).sp),
    displayMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Light, fontSize = 42.sp, lineHeight = 48.sp, letterSpacing = (-1.2).sp),
    displaySmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Light, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.8).sp),
)

private val shapes = Shapes(small = RoundedCornerShape(6.dp), medium = RoundedCornerShape(10.dp), large = RoundedCornerShape(12.dp))

@Composable
fun isDarkTheme(mode: ThemeMode) = when (mode) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}

@Composable
fun StudyMateTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val palette = if (isDarkTheme(mode)) DarkPalette else LightPalette
    CompositionLocalProvider(LocalSmPalette provides palette) {
        MaterialTheme(colorScheme = colorScheme(palette), typography = typography(palette), shapes = shapes, content = content)
    }
}
