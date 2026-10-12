package com.uzairbukhari.photon.tile

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.uzairbukhari.photon.PhotonApp
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.DevicesResponse
import com.uzairbukhari.photon.data.asBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

/** Quick Settings tile that switches the device chosen in the app (Devices > device > Quick Settings tile). */
class PhotonTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val graph get() = (application as PhotonApp).graph

    override fun onStartListening() {
        scope.launch { refresh() }
    }

    override fun onStopListening() {
        // Keep the scope: a toggle in flight should finish and update the tile.
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onClick() {
        scope.launch {
            val device = currentDevice() ?: return@launch refresh()
            val main = device.mainSwitch ?: return@launch refresh()
            val on = device.point(main.code)?.raw.asBoolean() ?: return@launch refresh()
            qsTile?.apply { state = Tile.STATE_UNAVAILABLE; updateTile() }
            try {
                graph.api.post("/api/devices/tuya/${device.id}/command", buildJsonObject { put("code", main.code); put("value", !on) }.toString())
            } catch (_: IOException) {
                // The tile refreshes below and shows the unchanged state.
            }
            refresh()
        }
    }

    private suspend fun currentDevice(): Device? {
        val id = graph.prefs.tileDevice.value ?: return null
        if (!graph.session.signedIn.value) return null
        return try {
            AppJson.decodeFromString<DevicesResponse>(graph.repository.read("/api/devices").body).devices.firstOrNull { it.id == id }
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun refresh() {
        val tile = qsTile ?: return
        val device = currentDevice()
        val on = device?.mainSwitch?.let { device.point(it.code)?.raw.asBoolean() }
        tile.label = device?.title ?: "Photon"
        tile.subtitle = when {
            !graph.session.signedIn.value -> "Sign in to the app"
            graph.prefs.tileDevice.value == null -> "Pick a device in the app"
            device == null -> "Unavailable"
            !device.controllable -> "Offline"
            on == null -> "No switch"
            else -> if (on) "On" else "Off"
        }
        tile.state = when {
            device == null || !device.controllable || on == null -> Tile.STATE_UNAVAILABLE
            on -> Tile.STATE_ACTIVE
            else -> Tile.STATE_INACTIVE
        }
        tile.updateTile()
    }
}
