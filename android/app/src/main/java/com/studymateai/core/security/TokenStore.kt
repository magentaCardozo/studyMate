package com.studymateai.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stockage des jetons chiffrés par une clé AES-GCM non exportable de l'Android Keystore.
 * Aucun jeton n'est écrit en clair ; le mot de passe n'est jamais conservé.
 */
class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("studymate_secure", Context.MODE_PRIVATE)
    private val alias = "studymate_tokens_v1"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(out, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String? = runCatching {
        val (iv, data) = stored.split(":").let { Base64.decode(it[0], Base64.NO_WRAP) to Base64.decode(it[1], Base64.NO_WRAP) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        String(cipher.doFinal(data), Charsets.UTF_8)
    }.getOrNull()

    @get:Synchronized
    val accessToken: String? get() = prefs.getString("access", null)?.let(::decrypt)

    @get:Synchronized
    val refreshToken: String? get() = prefs.getString("refresh", null)?.let(::decrypt)

    @Synchronized
    fun save(access: String, refresh: String) {
        prefs.edit().putString("access", encrypt(access)).putString("refresh", encrypt(refresh)).apply()
    }

    @Synchronized
    fun clear() {
        prefs.edit().clear().apply()
    }

    val isLoggedIn: Boolean get() = refreshToken != null
}
