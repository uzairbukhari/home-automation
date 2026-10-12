package com.uzairbukhari.photon.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** One "if" line: a solar reading, a device reading, or a time window. */
@Serializable
data class Condition(
    val source: String,
    val metric: String? = null,
    val deviceId: String? = null,
    val operator: String? = null,
    val value: JsonElement? = null,
    val start: String? = null,
    val end: String? = null,
    val days: List<Int>? = null,
)

@Serializable
data class RuleAction(val deviceId: String, val code: String, val value: JsonElement)

@Serializable
data class Recovery(val conditions: List<Condition> = emptyList(), val actions: List<RuleAction> = emptyList())

@Serializable
data class AutomationRule(
    val id: String,
    val name: String,
    val enabled: Boolean = false,
    val logic: String = "all",
    val conditions: List<Condition> = emptyList(),
    val actions: List<RuleAction> = emptyList(),
    val recovery: Recovery? = null,
    val durationMinutes: Int = 0,
    val cooldownMinutes: Int = 30,
)

@Serializable
data class RuleState(
    val active: Boolean = false,
    val since: String? = null,
    val lastAction: String? = null,
    val lastEvaluated: String? = null,
    val reason: String? = null,
)

@Serializable
data class RuleEntry(val rule: AutomationRule, val state: RuleState? = null)

@Serializable
data class RunAction(
    val status: String = "",
    val error: String? = null,
    @SerialName("device_id") val deviceId: String? = null,
    val code: String? = null,
)

@Serializable
data class AutomationRun(
    val id: String,
    @SerialName("rule_id") val ruleId: String,
    @SerialName("started_at") val startedAt: String,
    val status: String = "",
    val reason: String? = null,
    val actions: List<RunAction> = emptyList(),
)

/** GET /api/automations */
@Serializable
data class AutomationSnapshot(
    val rules: List<RuleEntry> = emptyList(),
    val paused: Boolean = false,
    val runs: List<AutomationRun> = emptyList(),
)

@Serializable
data class ActivityItem(
    val id: Long,
    @SerialName("rule_id") val ruleId: String,
    @SerialName("occurred_at") val occurredAt: String,
    val status: String = "",
    val reason: String = "",
    val name: String = "",
)

@Serializable
data class ActivityPage(val items: List<ActivityItem> = emptyList(), val nextCursor: Long? = null)

val SOLAR_METRICS = listOf(
    "battery_soc" to "Battery level (%)",
    "solar_power" to "Solar power (W)",
    "home_power" to "Home load (W)",
    "grid_power" to "Grid power (W)",
    "battery_voltage" to "Battery voltage (V)",
    "inverter_temperature" to "Inverter temperature",
)

val OPERATORS = listOf("gte" to "is at least", "lte" to "is at most", "gt" to "is above", "lt" to "is below", "equals" to "equals")
val WEEKDAYS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

private fun clauseValue(value: JsonElement?): String = value.asBoolean()?.let { if (it) "on" else "off" }
    ?: value.asNumber()?.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }
    ?: value.asString()?.let(::friendlyOption)
    ?: "?"

/** "Battery level (%) is at most 20", the same plain wording as the website's rule summaries. */
fun describeCondition(condition: Condition, deviceName: (String) -> String): String = when (condition.source) {
    "schedule" -> "Between ${condition.start} and ${condition.end} on ${condition.days.orEmpty().sorted().joinToString(", ") { WEEKDAYS.getOrElse(it) { "?" } }}"
    else -> {
        val subject = if (condition.source == "solar") {
            SOLAR_METRICS.firstOrNull { it.first == condition.metric }?.second ?: condition.metric.orEmpty()
        } else {
            "${deviceName(condition.deviceId.orEmpty())} · ${friendlyLabel(condition.metric.orEmpty())}"
        }
        val op = when (condition.operator) {
            "above", "gte" -> "is at least"
            "below", "lte" -> "is at most"
            "gt" -> "is above"
            "lt" -> "is below"
            else -> "is"
        }
        "$subject $op ${clauseValue(condition.value)}"
    }
}

fun describeAction(action: RuleAction, deviceName: (String) -> String): String =
    "Set ${deviceName(action.deviceId)} · ${friendlyLabel(action.code)} to ${clauseValue(action.value)}"
