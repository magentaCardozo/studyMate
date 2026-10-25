package com.studymateai.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "studymate_prefs")

/** Préférences non sensibles (DataStore). Les jetons sont dans TokenStore (Keystore). */
class Preferences(private val context: Context) {
    private object Keys {
        val wifiOnly = booleanPreferencesKey("wifi_only_downloads")
        val lastSync = stringPreferencesKey("last_sync_server_time")
        val lastSyncAt = longPreferencesKey("last_sync_at")
        val lastSyncError = stringPreferencesKey("last_sync_error")
        val lastConflict = stringPreferencesKey("last_conflict")
        val userName = stringPreferencesKey("user_name")
        val userEmail = stringPreferencesKey("user_email")
    }

    val wifiOnly: Flow<Boolean> = context.dataStore.data.map { it[Keys.wifiOnly] ?: true }
    val lastSyncAt: Flow<Long?> = context.dataStore.data.map { it[Keys.lastSyncAt] }
    val lastSyncError: Flow<String?> = context.dataStore.data.map { it[Keys.lastSyncError] }
    val lastConflict: Flow<String?> = context.dataStore.data.map { it[Keys.lastConflict] }
    val userName: Flow<String?> = context.dataStore.data.map { it[Keys.userName] }
    val userEmail: Flow<String?> = context.dataStore.data.map { it[Keys.userEmail] }

    suspend fun lastSyncCursor(): String? = context.dataStore.data.first()[Keys.lastSync]
    suspend fun isWifiOnly(): Boolean = wifiOnly.first()

    suspend fun setWifiOnly(v: Boolean) = context.dataStore.edit { it[Keys.wifiOnly] = v }
    suspend fun setUser(name: String, email: String) = context.dataStore.edit { it[Keys.userName] = name; it[Keys.userEmail] = email }

    suspend fun syncSucceeded(cursor: String) = context.dataStore.edit {
        it[Keys.lastSync] = cursor
        it[Keys.lastSyncAt] = System.currentTimeMillis()
        it.remove(Keys.lastSyncError)
    }

    suspend fun syncFailed(message: String) = context.dataStore.edit { it[Keys.lastSyncError] = message }
    suspend fun setConflict(message: String?) = context.dataStore.edit { if (message == null) it.remove(Keys.lastConflict) else it[Keys.lastConflict] = message }
    suspend fun clear() = context.dataStore.edit { it.clear() }
}
