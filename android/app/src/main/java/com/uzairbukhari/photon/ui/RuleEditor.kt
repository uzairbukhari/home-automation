package com.uzairbukhari.photon.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.uzairbukhari.photon.data.AutomationRule
import com.uzairbukhari.photon.data.Capability
import com.uzairbukhari.photon.data.Condition
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.OPERATORS
import com.uzairbukhari.photon.data.Recovery
import com.uzairbukhari.photon.data.RuleAction
import com.uzairbukhari.photon.data.SOLAR_METRICS
import com.uzairbukhari.photon.data.WEEKDAYS
import com.uzairbukhari.photon.data.describeAction
import com.uzairbukhari.photon.data.describeCondition
import com.uzairbukhari.photon.data.friendlyLabel
import com.uzairbukhari.photon.data.friendlyOption
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID

fun newRuleId(): String = "rule-" + UUID.randomUUID().toString().take(8)

fun blankRule() = AutomationRule(
    id = newRuleId(), name = "", enabled = false, logic = "all",
    conditions = listOf(Condition(source = "solar", metric = "battery_soc", operator = "lte", value = JsonPrimitive(20))),
    actions = emptyList(), durationMinutes = 0, cooldownMinutes = 30,
)

/** Controls a rule may read or write, mirroring the server's validateAutomation. */
fun readable(device: Device): List<Capability> = device.capabilities.filter { it.type == "Boolean" || it.type == "Enum" || (it.type == "Integer" && it.metadataVerified) }
fun writable(device: Device): List<Capability> = readable(device).filter { it.writable }

/** Why the rule can't be saved yet, or null when it is complete. */
fun ruleProblem(rule: AutomationRule): String? = when {
    rule.name.isBlank() -> "Give the rule a name."
    rule.conditions.isEmpty() -> "Add at least one condition."
    rule.actions.isEmpty() -> "Add at least one action."
    rule.conditions.any { it.source != "schedule" && it.value == null } || (rule.recovery?.conditions.orEmpty()).any { it.source != "schedule" && it.value == null } -> "Fill in every condition value."
    rule.conditions.any { it.source == "tuya" && (it.deviceId == null || it.metric == null) } -> "Choose a device reading for each device condition."
    rule.conditions.any { it.source == "schedule" && (it.start.isNullOrBlank() || it.end.isNullOrBlank() || it.days.isNullOrEmpty()) } -> "Set the time window and weekdays."
    rule.actions.any { it.deviceId.isBlank() || it.code.isBlank() } -> "Choose a device control for each action."
    rule.cooldownMinutes < 10 -> "Cooldown must be at least 10 minutes."
    else -> null
}

@Composable
fun RuleEditor(
    initial: AutomationRule,
    devices: List<Device>,
    isNew: Boolean,
    simulation: String?,
    onSave: (AutomationRule) -> Unit,
    onTest: (AutomationRule) -> Unit,
    onDelete: () -> Unit,
    onClose: () -> Unit,
) {
    var rule by remember { mutableStateOf(initial) }
    val problem = ruleProblem(rule)
    fun name(id: String) = devices.firstOrNull { it.id == id }?.title ?: "Unknown device"

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = onClose) { Text("Cancel") }
                    Text(if (isNew) "New automation" else "Edit automation", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.onBackground)
                    TextButton(onClick = { onSave(rule.copy(name = rule.name.trim())) }, enabled = problem == null) { Text("Save") }
                }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedTextField(rule.name, { rule = rule.copy(name = it.take(100)) }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                    Section("When") {
                        Picker("Match", listOf("all" to "All conditions are true", "any" to "Any condition is true"), rule.logic, { rule = rule.copy(logic = it) })
                        ConditionList(rule.conditions, devices, { rule = rule.copy(conditions = it) })
                    }
                    Section("Then") {
                        ActionList(rule.actions, devices, { rule = rule.copy(actions = it) })
                    }
                    Section("Timing") {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            NumberField("Hold for (min)", rule.durationMinutes.toDouble(), { rule = rule.copy(durationMinutes = (it ?: 0.0).toInt().coerceIn(0, 1440)) }, Modifier.weight(1f), integer = true)
                            NumberField("Cooldown (min)", rule.cooldownMinutes.toDouble(), { rule = rule.copy(cooldownMinutes = (it ?: 0.0).toInt().coerceIn(0, 1440)) }, Modifier.weight(1f), integer = true)
                        }
                        Text("Conditions must hold for the first number of minutes before the rule acts; after acting it waits for the cooldown (at least 10).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Section("Undo when finished (optional)") {
                        SwitchRow("Run a recovery step", "Runs once these conditions are met after the rule has acted.", rule.recovery != null) {
                            rule = rule.copy(recovery = if (it) Recovery() else null)
                        }
                        rule.recovery?.let { recovery ->
                            ConditionList(recovery.conditions, devices, { rule = rule.copy(recovery = recovery.copy(conditions = it)) })
                            ActionList(recovery.actions, devices, { rule = rule.copy(recovery = recovery.copy(actions = it)) })
                        }
                    }
                    problem?.let { Text(it, color = Hues.Warning) }
                    OutlinedButton(onClick = { onTest(rule) }, enabled = problem == null, modifier = Modifier.fillMaxWidth()) { Text("Test against current readings") }
                    simulation?.let {
                        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                            Text(it, Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                    Text("Summary", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    rule.conditions.forEach { Text("• " + describeCondition(it, ::name), color = MaterialTheme.colorScheme.onSurface) }
                    rule.actions.forEach { Text("→ " + describeAction(it, ::name), color = MaterialTheme.colorScheme.onSurface) }
                    if (!isNew) TextButton(onClick = onDelete) { Text("Delete automation", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}

@Composable
private fun ConditionList(conditions: List<Condition>, devices: List<Device>, onChange: (List<Condition>) -> Unit) {
    conditions.forEachIndexed { index, condition ->
        ConditionEditor(condition, devices, { onChange(conditions.toMutableList().also { list -> list[index] = it }) }, { onChange(conditions.filterIndexed { i, _ -> i != index }) })
    }
    var menu by remember { mutableStateOf(false) }
    Column {
        OutlinedButton(onClick = { menu = true }, enabled = conditions.size < 10) { Text("Add condition") }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text("Solar or battery reading") }, onClick = { menu = false; onChange(conditions + Condition(source = "solar", metric = "battery_soc", operator = "lte", value = JsonPrimitive(20))) })
            DropdownMenuItem(text = { Text("Device reading") }, onClick = { menu = false; onChange(conditions + Condition(source = "tuya", operator = "equals")) })
            DropdownMenuItem(text = { Text("Time window") }, onClick = { menu = false; onChange(conditions + Condition(source = "schedule", start = "09:00", end = "17:00", days = (0..6).toList())) })
        }
    }
}

@Composable
private fun ConditionEditor(condition: Condition, devices: List<Device>, onChange: (Condition) -> Unit, onRemove: () -> Unit) {
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (condition.source) {
                "solar" -> {
                    Picker("Reading", SOLAR_METRICS, condition.metric, { onChange(condition.copy(metric = it)) })
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Picker("Is", OPERATORS, condition.operator, { onChange(condition.copy(operator = it)) }, Modifier.weight(1f))
                        NumberField("Value", (condition.value as? JsonPrimitive)?.content?.toDoubleOrNull(), { onChange(condition.copy(value = it?.let(::numberElement))) }, Modifier.weight(1f))
                    }
                }
                "tuya" -> {
                    val device = devices.firstOrNull { it.id == condition.deviceId }
                    Picker("Device", devices.filter { readable(it).isNotEmpty() }.map { it.id to it.title }, condition.deviceId, { onChange(Condition(source = "tuya", deviceId = it, operator = "equals")) })
                    val caps = device?.let(::readable).orEmpty()
                    Picker("Reading", caps.map { it.code to device!!.label(it) }, condition.metric, { code ->
                        val cap = caps.first { it.code == code }
                        onChange(condition.copy(metric = code, operator = if (cap.type == "Integer") "gte" else "equals", value = null))
                    }, enabled = device != null)
                    val cap = caps.firstOrNull { it.code == condition.metric }
                    when (cap?.type) {
                        "Boolean" -> Picker("Is", listOf("true" to "On", "false" to "Off"), (condition.value as? JsonPrimitive)?.content, { onChange(condition.copy(operator = "equals", value = JsonPrimitive(it == "true"))) })
                        "Enum" -> Picker("Equals", cap.options.map { it to friendlyOption(it) }, (condition.value as? JsonPrimitive)?.content, { onChange(condition.copy(operator = "equals", value = JsonPrimitive(it))) })
                        "Integer" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Picker("Is", OPERATORS.filter { it.first != "equals" }, condition.operator, { onChange(condition.copy(operator = it)) }, Modifier.weight(1f))
                            NumberField("Value (${cap.unit})", (condition.value as? JsonPrimitive)?.content?.toDoubleOrNull(), { onChange(condition.copy(value = it?.let(::numberElement))) }, Modifier.weight(1f))
                        }
                    }
                }
                else -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(condition.start.orEmpty(), { onChange(condition.copy(start = it.take(5))) }, label = { Text("From (HH:mm)") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(condition.end.orEmpty(), { onChange(condition.copy(end = it.take(5))) }, label = { Text("Until (HH:mm)") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        WEEKDAYS.forEachIndexed { day, label ->
                            val on = day in condition.days.orEmpty()
                            FilterChip(selected = on, onClick = { onChange(condition.copy(days = if (on) condition.days.orEmpty() - day else (condition.days.orEmpty() + day).sorted())) }, label = { Text(label.take(2)) })
                        }
                    }
                }
            }
            TextButton(onClick = onRemove) { Text("Remove condition") }
        }
    }
}

@Composable
private fun ActionList(actions: List<RuleAction>, devices: List<Device>, onChange: (List<RuleAction>) -> Unit) {
    actions.forEachIndexed { index, action ->
        ActionEditor(action, devices, { onChange(actions.toMutableList().also { list -> list[index] = it }) }, { onChange(actions.filterIndexed { i, _ -> i != index }) })
    }
    OutlinedButton(onClick = { onChange(actions + RuleAction(deviceId = "", code = "", value = JsonPrimitive(true))) }, enabled = actions.size < 20) { Text("Add action") }
}

@Composable
private fun ActionEditor(action: RuleAction, devices: List<Device>, onChange: (RuleAction) -> Unit, onRemove: () -> Unit) {
    val device = devices.firstOrNull { it.id == action.deviceId }
    val caps = device?.let(::writable).orEmpty()
    val cap = caps.firstOrNull { it.code == action.code }
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Picker("Device", devices.filter { writable(it).isNotEmpty() }.map { it.id to it.title }, action.deviceId.ifBlank { null }, { onChange(RuleAction(it, "", JsonPrimitive(true))) })
            Picker("Control", caps.map { it.code to device!!.label(it) }, action.code.ifBlank { null }, { code ->
                val chosen = caps.first { it.code == code }
                onChange(action.copy(code = code, value = defaultValue(chosen)))
            }, enabled = device != null)
            when (cap?.type) {
                "Boolean" -> SwitchRow("Turn", if ((action.value as? JsonPrimitive)?.content == "true") "On" else "Off", (action.value as? JsonPrimitive)?.content == "true") { onChange(action.copy(value = JsonPrimitive(it))) }
                "Enum" -> Picker("Set to", cap.options.map { it to friendlyOption(it) }, (action.value as? JsonPrimitive)?.content, { onChange(action.copy(value = JsonPrimitive(it))) })
                "Integer" -> NumberField("Value (${cap.unit})", (action.value as? JsonPrimitive)?.content?.toDoubleOrNull(), { onChange(action.copy(value = it?.let(::numberElement) ?: JsonPrimitive(0))) }, Modifier.fillMaxWidth())
            }
            TextButton(onClick = onRemove) { Text("Remove action") }
        }
    }
}

private fun defaultValue(cap: Capability): JsonElement = when (cap.type) {
    "Boolean" -> JsonPrimitive(true)
    "Enum" -> JsonPrimitive(cap.options.firstOrNull().orEmpty())
    else -> numberElement(cap.min ?: 0.0)
}

