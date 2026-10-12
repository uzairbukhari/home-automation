package com.uzairbukhari.photon.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.ActivityItem
import com.uzairbukhari.photon.data.ActivityPage
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.RequestJson
import com.uzairbukhari.photon.data.AutomationRule
import com.uzairbukhari.photon.data.AutomationSnapshot
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.DevicesResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

data class AutomationsState(
    val loading: Boolean = true,
    val snapshot: AutomationSnapshot = AutomationSnapshot(),
    val devices: List<Device> = emptyList(),
    val activity: List<ActivityItem> = emptyList(),
    val nextCursor: Long? = null,
    val offline: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val simulation: String? = null,
)

class AutomationsViewModel(private val graph: Graph) : ViewModel() {
    private val _state = MutableStateFlow(AutomationsState())
    val state: StateFlow<AutomationsState> = _state.asStateFlow()

    private fun update(change: (AutomationsState) -> AutomationsState) {
        _state.value = change(_state.value)
    }

    fun deviceName(id: String): String = _state.value.devices.firstOrNull { it.id == id }?.title ?: "Unknown device"

    fun load() {
        viewModelScope.launch {
            try {
                val repo = graph.repository
                val snap = repo.read("/api/automations")
                val devices = runCatching { repo.read("/api/devices") }.getOrNull()
                val activity = runCatching { repo.read("/api/automations/activity") }.getOrNull()
                val page = activity?.let { AppJson.decodeFromString<ActivityPage>(it.body) }
                update {
                    it.copy(
                        loading = false,
                        snapshot = AppJson.decodeFromString(snap.body),
                        devices = devices?.let { d -> AppJson.decodeFromString<DevicesResponse>(d.body).devices } ?: it.devices,
                        activity = page?.items ?: it.activity,
                        nextCursor = page?.nextCursor,
                        offline = snap.fromCache,
                        error = null,
                    )
                }
            } catch (error: IOException) {
                update { it.copy(loading = false, error = error.message ?: "Automations are unavailable.") }
            }
        }
    }

    fun loadMoreActivity() {
        val cursor = _state.value.nextCursor ?: return
        viewModelScope.launch {
            try {
                val page = AppJson.decodeFromString<ActivityPage>(graph.api.get("/api/automations/activity?cursor=$cursor"))
                update { it.copy(activity = it.activity + page.items, nextCursor = page.nextCursor) }
            } catch (error: IOException) {
                update { it.copy(message = error.message) }
            }
        }
    }

    private fun post(body: JsonObject, done: String?) {
        viewModelScope.launch {
            val note = try {
                graph.api.post("/api/automations", body.toString())
                done
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(message = note) }
            load()
        }
    }

    fun setPaused(paused: Boolean) = post(buildJsonObject { put("operation", "pause"); put("paused", paused) }, if (paused) "All automations paused." else "Automations resumed.")

    fun save(rule: AutomationRule) = post(
        buildJsonObject {
            put("operation", "save")
            put("rule", RequestJson.encodeToJsonElement(AutomationRule.serializer(), rule))
        },
        "Saved ${rule.name}.",
    )

    fun setEnabled(rule: AutomationRule, enabled: Boolean) = save(rule.copy(enabled = enabled))

    fun delete(rule: AutomationRule) {
        viewModelScope.launch {
            val note = try {
                graph.api.send("DELETE", "/api/automations?id=${java.net.URLEncoder.encode(rule.id, "UTF-8")}")
                "Deleted ${rule.name}."
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(message = note) }
            load()
        }
    }

    /** Asks the server what the rule would do right now, without running it. */
    fun simulate(rule: AutomationRule) {
        viewModelScope.launch {
            update { it.copy(simulation = null) }
            val text = try {
                graph.api.post(
                    "/api/automations",
                    buildJsonObject {
                        put("operation", "simulate")
                        put("rule", RequestJson.encodeToJsonElement(AutomationRule.serializer(), rule))
                    }.toString(),
                )
            } catch (error: IOException) {
                error.message ?: "Could not test the rule."
            }
            update { it.copy(simulation = text.take(600)) }
        }
    }

    fun clearSimulation() = update { it.copy(simulation = null) }
    fun dismissMessage() = update { it.copy(message = null) }

    companion object {
        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AutomationsViewModel(graph) as T
        }
    }
}

