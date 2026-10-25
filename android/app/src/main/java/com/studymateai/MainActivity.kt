package com.studymateai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.studymateai.core.designsystem.StudyMateTheme
import com.studymateai.navigation.AppNavigation

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_StudyMate)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { StudyMateTheme { AppNavigation() } }
    }
}
