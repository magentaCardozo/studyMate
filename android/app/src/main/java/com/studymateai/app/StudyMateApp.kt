package com.studymateai.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import androidx.work.Configuration
import com.studymateai.core.database.AppDatabase
import com.studymateai.core.network.NetworkModule
import com.studymateai.core.security.TokenStore
import com.studymateai.data.local.Preferences
import com.studymateai.data.repositories.AuthRepository
import com.studymateai.data.repositories.DocumentRepository
import com.studymateai.data.repositories.OnlineRepository
import com.studymateai.data.repositories.StudyRepository
import com.studymateai.data.synchronization.SyncRepository
import com.studymateai.data.synchronization.SyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Injection de dépendances manuelle : un seul conteneur pour toute l'application. */
class AppContainer(context: Context) {
    val tokens = TokenStore(context)
    val prefs = Preferences(context)
    val db = AppDatabase.build(context)
    private val _sessionExpired = MutableStateFlow(false)
    val sessionExpired: StateFlow<Boolean> = _sessionExpired
    val network = NetworkModule(tokens) { _sessionExpired.value = true }
    val sync = SyncRepository(network.api, db, prefs)
    val auth = AuthRepository(context, network, tokens, db, prefs)
    val study = StudyRepository(context, db, sync, network)
    val documents = DocumentRepository(context, db, network, prefs)
    val online = OnlineRepository(network)
    fun resetSessionFlag() { _sessionExpired.value = false }

    private val _online = MutableStateFlow(true)
    val isOnline: StateFlow<Boolean> = _online

    init {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        _online.value = cm.activeNetwork != null
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _online.value = true
                // Retour du réseau : synchronisation des modifications faites hors ligne.
                if (tokens.isLoggedIn) SyncWorker.requestSoon(context)
            }
            override fun onLost(network: Network) { _online.value = false }
        })
    }
}

class StudyMateApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        if (container.tokens.isLoggedIn) SyncWorker.schedulePeriodic(this)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setMinimumLoggingLevel(android.util.Log.INFO).build()
}
