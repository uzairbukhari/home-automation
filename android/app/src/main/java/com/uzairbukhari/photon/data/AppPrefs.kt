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

    private val _biometric = MutableStateFlow(store.getPlain(BIOMETRIC) == "1")
    val biometric: StateFlow<Boolean> = _biometric.asStateFlow()

    fun setBiometric(on: Boolean) {
        store.putPlain(BIOMETRIC, if (on) "1" else "0")
        _biometric.value = on
    }

    private val _tileDevice = MutableStateFlow(store.getPlain(TILE))
    val tileDevice: StateFlow<String?> = _tileDevice.asStateFlow()

    /** The device the Quick Settings tile switches on and off. */
    fun setTileDevice(id: String?) {
        if (id == null) store.remove(TILE) else store.putPlain(TILE, id)
        _tileDevice.value = id
    }

    var lastAlertId: Long?
        get() = store.getPlain(LAST_ALERT)?.toLongOrNull()
        set(value) { if (value == null) store.remove(LAST_ALERT) else store.putPlain(LAST_ALERT, value.toString()) }

    private companion object {
        const val THEME = "theme"
        const val BIOMETRIC = "biometric"
        const val TILE = "tile_device"
        const val LAST_ALERT = "last_alert_id"
    }
}
