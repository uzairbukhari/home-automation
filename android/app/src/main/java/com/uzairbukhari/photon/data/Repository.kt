package com.uzairbukhari.photon.data

import java.io.IOException

/** A server answer, either fresh or the last saved copy when the phone is offline. */
data class Fetched(val body: String, val savedAtMillis: Long, val fromCache: Boolean)

/** Network-first reads that fall back to the last saved copy of the same request. */
class Repository(private val api: ApiClient, private val store: SecureStore) {
    suspend fun read(path: String): Fetched {
        try {
            val body = api.get(path)
            val now = System.currentTimeMillis()
            store.putSecret(cacheKey(path), body)
            store.putPlain(cacheTimeKey(path), now.toString())
            return Fetched(body, now, fromCache = false)
        } catch (error: IOException) {
            // A reply from the server (even an error) is a real answer; only connection trouble falls back.
            if (error is ApiException) throw error
            val saved = store.getSecret(cacheKey(path))
            val at = store.getPlain(cacheTimeKey(path))?.toLongOrNull()
            if (saved != null && at != null) return Fetched(saved, at, fromCache = true)
            throw error
        }
    }

    suspend fun refreshNow(): String = api.post("/api/refresh")

    fun clearCache(paths: List<String>) = paths.forEach {
        store.remove(cacheKey(it))
        store.remove(cacheTimeKey(it))
    }

    private fun cacheKey(path: String) = "cache:$path"
    private fun cacheTimeKey(path: String) = "cache_at:$path"
}
