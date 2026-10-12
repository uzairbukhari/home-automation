package com.uzairbukhari.photon.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.CommandResult
import com.uzairbukhari.photon.data.CommandStatus
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.DeviceGroup
import com.uzairbukhari.photon.data.DevicesResponse
import com.uzairbukhari.photon.data.FavoritesResponse
import com.uzairbukhari.photon.data.GroupsResponse
import com.uzairbukhari.photon.data.RoomsResponse
import com.uzairbukhari.photon.data.Scene
import com.uzairbukhari.photon.data.ScenesResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

data class DevicesState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val devices: List<Device> = emptyList(),
    val favorites: Set<String> = emptySet(),
    val scenes: List<Scene> = emptyList(),
    val groups: List<DeviceGroup> = emptyList(),
    val rooms: List<String> = emptyList(),
    val offline: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    /** "deviceId:code" of commands waiting for the device to confirm. */
    val pending: Set<String> = emptySet(),
)

class DevicesViewModel(private val graph: Graph) : ViewModel() {
    private val _state = MutableStateFlow(DevicesState())
    val state: StateFlow<DevicesState> = _state.asStateFlow()

    private fun update(change: (DevicesState) -> DevicesState) {
        _state.value = change(_state.value)
    }

    fun load(pull: Boolean = false) {
        viewModelScope.launch {
            if (pull) update { it.copy(refreshing = true) }
            try {
                val repo = graph.repository
                coroutineScope {
                    val devices = async { repo.read("/api/devices") }
                    val favorites = async { runCatching { repo.read("/api/favorites") }.getOrNull() }
                    val scenes = async { runCatching { repo.read("/api/tuya/scenes") }.getOrNull() }
                    val groups = async { runCatching { repo.read("/api/tuya/groups") }.getOrNull() }
                    val rooms = async { runCatching { repo.read("/api/tuya/rooms") }.getOrNull() }
                    val list = devices.await()
                    val favoritesBody = favorites.await()
                    val scenesBody = scenes.await()
                    val groupsBody = groups.await()
                    val roomsBody = rooms.await()
                    update { old ->
                        old.copy(
                            loading = false,
                            refreshing = false,
                            devices = AppJson.decodeFromString<DevicesResponse>(list.body).devices,
                            favorites = favoritesBody?.let { f -> AppJson.decodeFromString<FavoritesResponse>(f.body).favorites.filter { it.kind == "device" }.map { it.itemId }.toSet() } ?: old.favorites,
                            scenes = scenesBody?.let { AppJson.decodeFromString<ScenesResponse>(it.body).scenes } ?: old.scenes,
                            groups = groupsBody?.let { AppJson.decodeFromString<GroupsResponse>(it.body).groups } ?: old.groups,
                            rooms = roomsBody?.let { AppJson.decodeFromString<RoomsResponse>(it.body).rooms } ?: old.rooms,
                            offline = list.fromCache,
                            error = null,
                        )
                    }
                }
            } catch (error: IOException) {
                update { it.copy(loading = false, refreshing = false, error = error.message ?: "Devices are unavailable.") }
            }
        }
    }

    /** Asks the server to poll the devices now. */
    fun syncNow() {
        viewModelScope.launch {
            update { it.copy(refreshing = true) }
            val note = try {
                graph.api.post("/api/devices/refresh")
                null
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(message = note) }
            load(pull = true)
        }
    }

    fun send(device: Device, code: String, value: JsonElement) {
        val key = "${device.id}:$code"
        if (key in _state.value.pending || _state.value.offline) return
        update { it.copy(pending = it.pending + key, message = null) }
        viewModelScope.launch {
            var note: String? = null
            try {
                val body = buildJsonObject { put("code", code); put("value", value) }.toString()
                val result = AppJson.decodeFromString<CommandResult>(graph.api.post("/api/devices/tuya/${device.id}/command", body))
                var status = result.status
                var tries = 0
                // The device confirms asynchronously; wait a few seconds for it.
                while (result.commandId != null && status in OPEN_STATUSES && tries < 6) {
                    delay(2_000)
                    tries++
                    status = runCatching {
                        AppJson.decodeFromString<CommandStatus>(graph.api.get("/api/commands/${result.commandId}")).status
                    }.getOrDefault(status)
                }
                if (status == "failed" || status == "expired") note = "${device.title} did not accept the change."
                if (status == "uncertain") note = "Sent, but ${device.title} has not confirmed yet."
            } catch (error: IOException) {
                note = error.message
            }
            update { it.copy(pending = it.pending - key, message = note) }
            load()
        }
    }

    fun toggleFavorite(device: Device) {
        val make = device.id !in _state.value.favorites
        update { it.copy(favorites = if (make) it.favorites + device.id else it.favorites - device.id) }
        viewModelScope.launch {
            try {
                val body = buildJsonObject { put("kind", "device"); put("itemId", device.id); put("favorite", make) }.toString()
                graph.api.send("PUT", "/api/favorites", body)
            } catch (error: IOException) {
                update { it.copy(favorites = if (make) it.favorites - device.id else it.favorites + device.id, message = error.message) }
            }
        }
    }

    fun runScene(scene: Scene) = runAction("/api/tuya/scenes", buildJsonObject {
        put("operation", "run"); put("homeId", scene.homeId); put("sceneId", scene.sceneId)
    }.toString(), "Started ${scene.name}.")

    fun runGroup(group: DeviceGroup) = runAction("/api/tuya/groups", buildJsonObject {
        put("operation", "run"); put("id", group.id)
    }.toString(), "Ran ${group.name}.")

    private fun runAction(path: String, body: String, done: String) {
        viewModelScope.launch {
            val note = try {
                graph.api.post(path, body)
                done
            } catch (error: IOException) {
                error.message
            }
            update { it.copy(message = note) }
            load()
        }
    }

    fun setRoom(device: Device, room: String) {
        viewModelScope.launch {
            try {
                val name = room.trim()
                if (name.isNotEmpty() && name !in _state.value.rooms) {
                    graph.api.post("/api/tuya/rooms", buildJsonObject { put("name", name) }.toString())
                }
                graph.api.send("PATCH", "/api/tuya/${device.id}/room", buildJsonObject { put("room", name) }.toString())
                update { it.copy(message = "Moved ${device.title} to ${name.ifEmpty { "Unassigned" }}.") }
            } catch (error: IOException) {
                update { it.copy(message = error.message) }
            }
            load()
        }
    }

    fun rename(device: Device, alias: String) {
        viewModelScope.launch {
            try {
                val body = buildJsonObject {
                    put("alias", alias.trim())
                    put("upstream", device.upstream)
                    put("channelLabels", buildJsonObject { device.channelLabels.forEach { (k, v) -> put(k, v) } })
                }.toString()
                graph.api.send("PATCH", "/api/tuya/${device.id}/preferences", body)
            } catch (error: IOException) {
                update { it.copy(message = error.message) }
            }
            load()
        }
    }

    fun dismissMessage() = update { it.copy(message = null) }

    companion object {
        private val OPEN_STATUSES = setOf("pending", "accepted")

        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = DevicesViewModel(graph) as T
        }
    }
}

fun boolValue(value: Boolean): JsonElement = JsonPrimitive(value)
