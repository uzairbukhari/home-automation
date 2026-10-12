package com.uzairbukhari.photon.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/** A server answer, either fresh or the last saved copy when the phone is offline. */
data class Fetched(val body: String, val savedAtMillis: Long, val fromCache: Boolean)

/** Network-first reads that fall back to the last saved copy of the same request. */
class Repository(private val api: ApiClient, private val store: SecureStore) {
    /** Runs on IO: the encrypted cache write (Keystore AES-GCM) must never block the main thread. */
    suspend fun read(path: String): Fetched = withContext(Dispatchers.IO) {
        try {
            val body = api.get(path)
            val now = System.currentTimeMillis()
            store.putSecret(cacheKey(path), body)
            store.putPlain(cacheTimeKey(path), now.toString())
            Fetched(body, now, fromCache = false)
        } catch (error: IOException) {
            // A reply from the server (even an error) is a real answer; only connection trouble falls back.
            if (error is ApiException) throw error
            val saved = store.getSecret(cacheKey(path))
            val at = store.getPlain(cacheTimeKey(path))?.toLongOrNull()
            if (saved != null && at != null) Fetched(saved, at, fromCache = true) else throw error
        }
    }

    suspend fun refreshNow(): String = api.post("/api/refresh")

    /** Forgets every saved copy; used when signing out. */
    fun clearAll() = store.removeWhere { it.startsWith("cache:") || it.startsWith("cache_at:") }

    private fun cacheKey(path: String) = "cache:$path"
    private fun cacheTimeKey(path: String) = "cache_at:$path"
}
