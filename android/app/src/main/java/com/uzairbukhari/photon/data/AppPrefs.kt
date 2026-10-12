package com.uzairbukhari.photon.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Phone-only preferences (nothing here is sent to the server). */
class AppPrefs(private val store: SecureStore) {
    private val _theme = MutableStateFlow(store.getPlain(THEME) ?: "system")
    val theme: StateFlow<String> = _theme.asStateFlow()

    fun setTheme(mode: String) {
        store.putPlain(THEME, mode)
        _theme.value = mode
    }

    private companion object {
        const val THEME = "theme"
    }
}
