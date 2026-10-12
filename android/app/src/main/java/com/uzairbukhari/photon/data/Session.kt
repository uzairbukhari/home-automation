package com.uzairbukhari.photon.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Who is signed in and where the server is. The token lives only in encrypted storage. */
class Session(private val store: SecureStore) {
    private val _signedIn = MutableStateFlow(store.getSecret(TOKEN) != null && store.getPlain(SERVER) != null)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    val serverUrl: String? get() = store.getPlain(SERVER)
    val token: String? get() = store.getSecret(TOKEN)

    fun signIn(server: String, token: String) {
        store.putPlain(SERVER, server)
        store.putSecret(TOKEN, token)
        _signedIn.value = true
    }

    fun signOut() {
        store.remove(TOKEN)
        _signedIn.value = false
    }

    private companion object {
        const val SERVER = "server"
        const val TOKEN = "token"
    }
}
