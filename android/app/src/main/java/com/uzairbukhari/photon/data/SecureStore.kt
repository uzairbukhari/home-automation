package com.uzairbukhari.photon.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Small key/value store whose values are encrypted with an Android Keystore AES key. */
class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("photon_secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun putSecret(name: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(value.toByteArray())
        prefs.edit().putString(name, encode(cipher.iv) + ":" + encode(sealed)).apply()
    }

    fun getSecret(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        return try {
            val (iv, sealed) = stored.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
            val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
            String(cipher.doFinal(sealed))
        } catch (_: Exception) {
            // Key was lost (for example after a restore): treat the value as missing.
            null
        }
    }

    fun putPlain(name: String, value: String) = prefs.edit().putString(name, value).apply()
    fun getPlain(name: String): String? = prefs.getString(name, null)
    fun remove(name: String) = prefs.edit().remove(name).apply()

    fun removeWhere(match: (String) -> Boolean) {
        val editor = prefs.edit()
        prefs.all.keys.filter(match).forEach { editor.remove(it) }
        editor.apply()
    }

    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private companion object {
        const val ALIAS = "photon_store_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
