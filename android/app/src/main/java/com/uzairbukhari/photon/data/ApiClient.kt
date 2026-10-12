package com.uzairbukhari.photon.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : IOException(message)

/** Turns what a person typed ("home.example.workers.dev") into a clean https base URL, or null. */
fun normalizeServerUrl(input: String): String? {
    var text = input.trim().trimEnd('/')
    if (text.isEmpty()) return null
    if (!text.contains("://")) text = "https://$text"
    val url = text.toHttpUrlOrNull() ?: return null
    if (url.scheme != "https" || url.host.isEmpty()) return null
    return url.newBuilder().encodedPath("/").query(null).fragment(null).build().toString().trimEnd('/')
}

/** Talks to the Photon server with the owner's bearer token. */
class ApiClient(private val session: Session) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun url(path: String): HttpUrl {
        val base = session.serverUrl ?: throw ApiException(0, "No server address is set.")
        return (base + path).toHttpUrlOrNull() ?: throw ApiException(0, "The server address is not valid.")
    }

    suspend fun login(server: String, password: String) {
        val base = normalizeServerUrl(server) ?: throw ApiException(0, "Enter your server address, for example home.example.workers.dev.")
        val body = buildJsonObject { put("password", password) }.toString()
        val request = Request.Builder()
            .url("$base/api/mobile/login")
            .post(body.toRequestBody(JSON))
            .build()
        val text = execute(request, authenticated = false)
        val token = AppJson.decodeFromString<LoginResponse>(text).token
        session.signIn(base, token)
    }

    suspend fun get(path: String): String = execute(Request.Builder().url(url(path)).get().build())

    suspend fun post(path: String, body: String = "{}"): String = send("POST", path, body)

    /** POST, PUT, PATCH or DELETE with an optional JSON body. */
    suspend fun send(method: String, path: String, body: String? = null): String =
        execute(Request.Builder().url(url(path)).method(method, body?.toRequestBody(JSON)).build())

    private suspend fun execute(request: Request, authenticated: Boolean = true): String = withContext(Dispatchers.IO) {
        val signed = if (authenticated) {
            val token = session.token ?: throw ApiException(401, "Sign in again.")
            request.newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            request
        }
        http.newCall(signed).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.isSuccessful) return@use text
            if (authenticated && response.code == 401) session.signOut()
            val message = runCatching { AppJson.decodeFromString<ErrorResponse>(text).error }.getOrNull()
            throw ApiException(response.code, message ?: "The server answered ${response.code}.")
        }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
