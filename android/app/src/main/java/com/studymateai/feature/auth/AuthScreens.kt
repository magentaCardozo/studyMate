package com.studymateai.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.studymateai.app.AppContainer
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Logo
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.appViewModel
import kotlinx.coroutines.launch

class AuthViewModel(private val c: AppContainer) : ViewModel() {
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun submit(register: Boolean, name: String, email: String, password: String, onDone: () -> Unit) {
        error = validate(register, name, email, password)
        if (error != null) return
        loading = true
        viewModelScope.launch {
            try {
                if (register) c.auth.register(name, email, password) else c.auth.login(email, password)
                c.resetSessionFlag()
                runCatching { c.sync.sync() } // premier chargement des données hors ligne
                onDone()
            } catch (e: Exception) {
                error = e.toUserMessage()
            } finally {
                loading = false
            }
        }
    }

    private fun validate(register: Boolean, name: String, email: String, password: String): String? = when {
        register && name.trim().length < 2 -> "Indiquez votre nom."
        !android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() -> "Adresse e-mail invalide."
        register && (password.length < 8 || password.none { it.isLetter() } || password.none { it.isDigit() }) -> "Mot de passe : 8 caractères minimum, avec une lettre et un chiffre."
        password.isEmpty() -> "Mot de passe requis."
        else -> null
    }
}

@Composable
fun AuthScreen(onAuthenticated: () -> Unit) {
    val vm = appViewModel { AuthViewModel(it) }
    var register by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Logo()
        Spacer(Modifier.height(12.dp))
        Text(if (register) "Créer votre compte" else "Connexion", style = MaterialTheme.typography.headlineLarge)
        Text(
            if (register) "Gratuit, en moins d’une minute." else "Organisez votre savoir. Comprenez vos cours. Préparez-vous avec confiance.",
            style = MaterialTheme.typography.bodyMedium.copy(color = SM.Muted),
        )
        vm.error?.let { ErrorState(it) }
        if (register) {
            OutlinedTextField(name, { name = it }, label = { Text("Nom complet") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(
            email, { email = it }, label = { Text("Adresse e-mail") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            password, { password = it }, label = { Text("Mot de passe") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            supportingText = if (register) ({ Text("8 caractères minimum, avec une lettre et un chiffre.") }) else null,
        )
        PrimaryButton(if (register) "Créer mon compte" else "Se connecter", { vm.submit(register, name, email, password, onAuthenticated) }, Modifier.fillMaxWidth(), loading = vm.loading)
        TextButton(onClick = { register = !register }) {
            Text(if (register) "Déjà inscrit ? Se connecter" else "Pas encore de compte ? Créer un compte", color = SM.Crimson)
        }
        if (register) Text("Vos documents restent privés. Ils ne sont transmis à un fournisseur d’IA qu’après votre accord explicite.", style = MaterialTheme.typography.bodySmall)
    }
}
