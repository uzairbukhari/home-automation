package com.uzairbukhari.photon.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.AlertPreferences
import com.uzairbukhari.photon.data.AlertRule
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.BillingSettings
import com.uzairbukhari.photon.data.CredentialStatus
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.DevicesResponse
import com.uzairbukhari.photon.data.ProviderStatus
import com.uzairbukhari.photon.data.ProvidersResponse
import com.uzairbukhari.photon.data.RequestJson
import com.uzairbukhari.photon.data.StorageHealth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

data class SettingsState(
    val billing: Section<BillingSettings> = Section(),
    val credentials: CredentialStatus? = null,
    val providers: List<ProviderStatus> = emptyList(),
    val alerts: Section<AlertPreferences> = Section(),
    val devices: List<Device> = emptyList(),
    val storage: Section<StorageHealth> = Section(),
    val saving: Boolean = false,
    val message: String? = null,
)

class SettingsViewModel(private val graph: Graph) : ViewModel() {
    private val _state = MutableStateFlow(SettingsState())
    val state: StateFlow<SettingsState> = _state.asStateFlow()

    private fun update(change: (SettingsState) -> SettingsState) {
        _state.value = change(_state.value)
    }

    fun loadBilling() {
        viewModelScope.launch {
            update { it.copy(billing = it.billing.copy(loading = true, error = null)) }
            try {
                val got = graph.repository.read("/api/settings")
                update { it.copy(billing = Section(AppJson.decodeFromString<BillingSettings>(got.body), offline = got.fromCache)) }
            } catch (error: IOException) {
                update { it.copy(billing = it.billing.copy(loading = false, error = error.message)) }
            }
        }
    }

    /** Sends only the editable numbers; the server keeps its tariff details as they are. */
    fun saveBilling(settings: BillingSettings) {
        viewModelScope.launch {
            update { it.copy(saving = true) }
            val note = try {
                graph.api.send("PUT", "/api/settings", RequestJson.encodeToString(BillingSettings.serializer(), settings))
                "Settings saved."
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(saving = false, message = note) }
            loadBilling()
        }
    }

    fun loadConnections() {
        viewModelScope.launch {
            try {
                val creds = AppJson.decodeFromString<CredentialStatus>(graph.api.get("/api/provider-credentials"))
                val providers = AppJson.decodeFromString<ProvidersResponse>(graph.api.get("/api/connection-status")).providers
                update { it.copy(credentials = creds, providers = providers) }
            } catch (error: IOException) {
                update { it.copy(message = error.message) }
            }
        }
    }

    fun saveCredentials(username: String, password: String, companyKey: String) {
        viewModelScope.launch {
            update { it.copy(saving = true) }
            val note = try {
                graph.api.send("PUT", "/api/provider-credentials", buildJsonObject {
                    put("username", username); put("password", password); put("companyKey", companyKey)
                }.toString())
                "Solar inverter login saved."
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(saving = false, message = note) }
            loadConnections()
        }
    }

    fun removeCredentials() {
        viewModelScope.launch {
            val note = try {
                graph.api.send("DELETE", "/api/provider-credentials")
                "Solar inverter login removed."
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(message = note) }
            loadConnections()
        }
    }

    fun loadAlerts() {
        viewModelScope.launch {
            update { it.copy(alerts = it.alerts.copy(loading = true, error = null)) }
            try {
                val got = graph.repository.read("/api/notifications/preferences")
                val devices = runCatching { graph.repository.read("/api/devices") }.getOrNull()
                update {
                    it.copy(
                        alerts = Section(AppJson.decodeFromString<AlertPreferences>(got.body), offline = got.fromCache),
                        devices = devices?.let { d -> AppJson.decodeFromString<DevicesResponse>(d.body).devices } ?: it.devices,
                    )
                }
            } catch (error: IOException) {
                update { it.copy(alerts = it.alerts.copy(loading = false, error = error.message)) }
            }
        }
    }

    /** Queues a test alert on the server; the caller then runs the background check to show it. */
    fun sendTestAlert(onQueued: () -> Unit) {
        viewModelScope.launch {
            val note = try {
                graph.api.post("/api/mobile/test-alert")
                null
            } catch (error: IOException) {
                error.message ?: "Could not reach the server."
            }
            if (note == null) onQueued() else update { it.copy(message = note) }
        }
    }

    fun saveAlerts(rules: List<AlertRule>) {
        viewModelScope.launch {
            update { it.copy(saving = true) }
            val note = try {
                val body = buildJsonObject {
                    put("rules", JsonArray(rules.map { RequestJson.encodeToJsonElement(AlertRule.serializer(), it) }))
                }
                graph.api.send("PUT", "/api/notifications/preferences", body.toString())
                "Alerts saved."
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(saving = false, message = note) }
            loadAlerts()
        }
    }

    fun loadStorage() {
        viewModelScope.launch {
            update { it.copy(storage = it.storage.copy(loading = true, error = null)) }
            try {
                val got = graph.repository.read("/api/storage-health")
                update { it.copy(storage = Section(AppJson.decodeFromString<StorageHealth>(got.body), offline = got.fromCache)) }
            } catch (error: IOException) {
                update { it.copy(storage = it.storage.copy(loading = false, error = error.message)) }
            }
        }
    }

    fun dismissMessage() = update { it.copy(message = null) }

    companion object {
        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = SettingsViewModel(graph) as T
        }
    }
}

