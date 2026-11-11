package com.studymateai

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.studymateai.app.StudyMateApp
import com.studymateai.core.designsystem.StudyMateTheme
import com.studymateai.core.designsystem.ThemeMode
import com.studymateai.core.designsystem.isDarkTheme
import com.studymateai.navigation.AppNavigation

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_StudyMate)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val prefs = (application as StudyMateApp).container.prefs
        setContent {
            val mode by prefs.theme.collectAsState(ThemeMode.SYSTEM)
            val dark = isDarkTheme(mode)
            // Barre d'état posée sur la bande cramoisie : icônes claires dans les deux thèmes.
            // Barre de navigation : icônes adaptées au thème choisi dans l'application.
            LaunchedEffect(dark) {
                val nav = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT), navigationBarStyle = nav)
            }
            StudyMateTheme(mode) { AppNavigation() }
        }
    }
}
