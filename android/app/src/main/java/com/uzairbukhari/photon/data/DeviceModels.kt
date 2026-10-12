package com.uzairbukhari.photon.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

@Serializable
data class Capability(
    val code: String,
    val name: String = "",
    val type: String = "",
    val writable: Boolean = false,
    val unit: String = "",
    val min: Double? = null,
    val max: Double? = null,
    val step: Double? = null,
    val scale: Int = 0,
    val options: List<String> = emptyList(),
    val metadataVerified: Boolean = false,
)

@Serializable
data class Datapoint(
    val code: String,
    val name: String = "",
    val raw: JsonElement? = null,
    val formatted: String = "",
    val numericValue: Double? = null,
    val unit: String = "",
    val updatedAt: String? = null,
    val available: Boolean = true,
)

@Serializable
data class Device(
    val id: String,
    val name: String = "",
    val room: String = "Unassigned",
    val category: String = "",
    val productName: String = "",
    val kind: String = "other",
    val online: Boolean = false,
    val alias: String? = null,
    val channelLabels: Map<String, String> = emptyMap(),
    val upstream: Boolean = false,
    val stale: Boolean = false,
    val updatedAt: String? = null,
    val primaryValue: String = "",
    val datapoints: List<Datapoint> = emptyList(),
    val capabilities: List<Capability> = emptyList(),
) {
    val title: String get() = alias?.takeIf { it.isNotBlank() } ?: name.ifBlank { id }
    val controllable: Boolean get() = online && !stale
    fun point(code: String): Datapoint? = datapoints.firstOrNull { it.code == code }
    fun label(cap: Capability): String = channelLabels[cap.code]?.takeIf { it.isNotBlank() } ?: friendlyLabel(cap.code, cap.name)

    /** The first on/off control, used for the quick switch on the device card. */
    val mainSwitch: Capability?
        get() = capabilities.firstOrNull { it.writable && it.type == "Boolean" && it.code in MAIN_SWITCH_CODES }

    private companion object {
        val MAIN_SWITCH_CODES = listOf("switch", "switch_1", "switch_led")
    }
}

@Serializable
data class DevicesResponse(val devices: List<Device> = emptyList(), val error: String? = null)

@Serializable
data class FavoriteItem(val kind: String, val itemId: String)

@Serializable
data class FavoritesResponse(val favorites: List<FavoriteItem> = emptyList())

@Serializable
data class Scene(
    @SerialName("home_id") val homeId: String,
    @SerialName("scene_id") val sceneId: String,
    val name: String,
)

@Serializable
data class ScenesResponse(val scenes: List<Scene> = emptyList())

@Serializable
data class DeviceGroup(val id: String, val name: String)

@Serializable
data class GroupsResponse(val groups: List<DeviceGroup> = emptyList())

@Serializable
data class RoomsResponse(val rooms: List<String> = emptyList())

@Serializable
data class CommandResult(val commandId: Long? = null, val status: String = "", val error: String? = null)

@Serializable
data class CommandStatus(val status: String = "", val error: String? = null)

fun JsonElement?.asBoolean(): Boolean? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
fun JsonElement?.asNumber(): Double? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
fun JsonElement?.asString(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private val LABELS = mapOf(
    "switch" to "Power", "switch_led" to "Light power", "cur_power" to "Power consumption", "cur_voltage" to "Voltage",
    "cur_current" to "Current", "add_ele" to "Energy used", "total_forward_energy" to "Total energy used",
    "forward_energy_total" to "Total energy used", "bright_value" to "Brightness", "bright_value_v2" to "Brightness",
    "temp_value" to "Colour temperature", "temp_value_v2" to "Colour temperature", "colour_data" to "Light colour",
    "colour_data_v2" to "Light colour", "work_mode" to "Lighting mode", "countdown" to "Auto-off timer",
    "countdown_1" to "Auto-off timer", "relay_status" to "Power after restart", "child_lock" to "Child lock",
    "light_mode" to "Indicator light", "indicator_status" to "Indicator light", "temp_set" to "Target temperature",
    "temp_current" to "Temperature", "humidity_value" to "Humidity", "fan_speed_percent" to "Fan speed",
    "mode" to "Operating mode", "fault" to "Device alerts", "overcharge_switch" to "Overload protection",
    "cycle_time" to "Repeat timer", "random_time" to "Random timer", "switch_inching" to "Momentary switch",
    "power_on_state" to "Power after restart", "led_type" to "Indicator mode", "switch_backlight" to "Backlight",
)

private val OPTIONS = mapOf(
    "white" to "White light", "colour" to "Colour light", "scene" to "Scene", "music" to "Music sync",
    "memory" to "Restore previous state", "last" to "Restore previous state", "off" to "Off", "on" to "On",
    "forward" to "Forward", "reverse" to "Reverse", "relay" to "Follow power state", "pos" to "On when powered",
    "none" to "Disabled", "auto" to "Automatic", "manual" to "Manual",
)

/** Same wording as the website's friendlyLabel. */
fun friendlyLabel(code: String, providerName: String = ""): String {
    LABELS[code]?.let { return it }
    Regex("^switch_(\\d+)$").find(code)?.let { return "Power · channel ${it.groupValues[1]}" }
    Regex("^countdown_(\\d+)$").find(code)?.let { return "Auto-off timer · channel ${it.groupValues[1]}" }
    val text = if (providerName.isNotEmpty() && providerName.all { it.code in 0x20..0x7E || it == '°' }) providerName else code
    return text.replace('_', ' ').replace(Regex("\\s+"), " ").replaceFirstChar { it.uppercase() }
}

fun friendlyOption(option: String): String = OPTIONS[option] ?: friendlyLabel(option)
