package com.uzairbukhari.photon.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.uzairbukhari.photon.BuildConfig
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.AlertRule
import com.uzairbukhari.photon.data.BillingSettings
import com.uzairbukhari.photon.data.Device
import kotlinx.serialization.json.JsonPrimitive

private val CATEGORIES = listOf(
    Triple("connections", "Connections", "Solar inverter and smart devices"),
    Triple("battery", "Battery", "Capacity and reserve"),
    Triple("billing", "Electricity & billing", "Tariffs and billing cycle"),
    Triple("notifications", "Alerts", "What should notify you"),
    Triple("appearance", "Appearance", "System, light or dark"),
    Triple("storage", "Collection & storage", "Data collection health"),
    Triple("account", "Account & app", "Server, version and sign out"),
)

@Composable
fun SettingsScreen(graph: Graph, model: SettingsViewModel, onMessage: (String) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var page by rememberSaveable { mutableStateOf<String?>(null) }
    BackHandler(enabled = page != null) { page = null }
    LaunchedEffect(state.message) {
        state.message?.let { onMessage(it); model.dismissMessage() }
    }

    val current = page
    if (current == null) {
        Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
            CATEGORIES.forEach { (id, title, note) ->
                Surface(Modifier.fillMaxWidth().clickable { page = id }, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                    Column(Modifier.padding(16.dp)) {
                        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) {
            TextButton(onClick = { page = null }) { Text("‹ Back") }
            Text(CATEGORIES.first { it.first == current }.second, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when (current) {
                "connections" -> ConnectionsPage(state, model)
                "battery", "billing" -> BillingPage(current, state, model)
                "notifications" -> AlertsPage(state, model)
                "appearance" -> AppearancePage(graph)
                "storage" -> StoragePage(state, model)
                else -> AccountPage(graph)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Hint(text: String) = Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun ConnectionsPage(state: SettingsState, model: SettingsViewModel) {
    LaunchedEffect(Unit) { model.loadConnections() }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var companyKey by remember { mutableStateOf("") }
    state.providers.forEach { p ->
        val name = if (p.provider == "tuya") "Smart devices (Tuya)" else "Solar inverter (DessMonitor)"
        val text = when (p.status) { "connected" -> "Connected"; "degraded" -> "Needs attention"; else -> "Not set up" }
        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
            Column(Modifier.fillMaxWidth().padding(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, color = MaterialTheme.colorScheme.onSurface)
                    Text(text, color = if (p.status == "connected") Hues.Battery else Hues.Warning)
                }
                p.blocker?.let { Hint(it) }
                p.lastSuccessAt?.let { Hint("Last success " + freshnessLabel(parseInstant(it)).removePrefix("Updated ")) }
            }
        }
    }
    Hint("Smart device (Tuya) credentials are set on your server.")
    Text("Solar inverter login", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
    Hint(if (state.credentials?.configured == true) "A login is saved. Enter new details to replace it." else "No login saved yet.")
    OutlinedTextField(username, { username = it }, label = { Text("DessMonitor username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(companyKey, { companyKey = it }, label = { Text("Company key") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Hint("Saved encrypted on your server and never sent back to the phone.")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { model.saveCredentials(username, password, companyKey); username = ""; password = ""; companyKey = "" }, enabled = !state.saving && username.isNotBlank() && password.isNotBlank() && companyKey.isNotBlank()) { Text("Save login") }
        if (state.credentials?.configured == true) OutlinedButton(onClick = model::removeCredentials) { Text("Remove") }
    }
}

@Composable
private fun BillingPage(which: String, state: SettingsState, model: SettingsViewModel) {
    LaunchedEffect(Unit) { model.loadBilling() }
    val section = state.billing
    val data = section.data
    if (data == null) {
        if (section.loading) CircularProgressIndicator() else Text(section.error ?: "Settings are unavailable.", color = MaterialTheme.colorScheme.error)
        return
    }
    var draft by remember(data) { mutableStateOf(data) }
    if (section.offline) Hint("Offline · changes can't be saved until you reconnect.")
    if (which == "battery") {
        NumberField("Battery capacity (kWh)", draft.capacity, { draft = draft.copy(capacity = it ?: draft.capacity) }, Modifier.fillMaxWidth())
        NumberField("Reserve level (%)", draft.threshold, { draft = draft.copy(threshold = it ?: draft.threshold) }, Modifier.fillMaxWidth())
        Hint("The reserve is the battery level shown on the energy flow and used for time-at-reserve reports.")
    } else {
        NumberField("Unit rate (Rs per kWh)", draft.unitRate, { draft = draft.copy(unitRate = it ?: draft.unitRate) }, Modifier.fillMaxWidth())
        NumberField("Reference rate (Rs per kWh)", draft.referenceRate, { draft = draft.copy(referenceRate = it ?: draft.referenceRate) }, Modifier.fillMaxWidth())
        NumberField("Fixed charges (Rs)", draft.fixedCharges, { draft = draft.copy(fixedCharges = it ?: draft.fixedCharges) }, Modifier.fillMaxWidth())
        NumberField("Adjustments (Rs)", draft.adjustments, { draft = draft.copy(adjustments = it ?: draft.adjustments) }, Modifier.fillMaxWidth())
        NumberField("Billing day of month (1–28)", draft.billingDay.toDouble(), { draft = draft.copy(billingDay = (it ?: draft.billingDay.toDouble()).toInt()) }, Modifier.fillMaxWidth(), integer = true)
        SwitchRow("Time-of-use pricing", "Different rates at peak and off-peak hours.", draft.timeOfUse) { draft = draft.copy(timeOfUse = it) }
        if (draft.timeOfUse) {
            NumberField("Peak rate (Rs per kWh)", draft.peakRate, { draft = draft.copy(peakRate = it ?: draft.peakRate) }, Modifier.fillMaxWidth())
            NumberField("Off-peak rate (Rs per kWh)", draft.offPeakRate, { draft = draft.copy(offPeakRate = it ?: draft.offPeakRate) }, Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(draft.peakStart, { draft = draft.copy(peakStart = it.take(5)) }, label = { Text("Peak from") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(draft.peakEnd, { draft = draft.copy(peakEnd = it.take(5)) }, label = { Text("Peak until") }, singleLine = true, modifier = Modifier.weight(1f))
            }
        }
        Hint("Tax status and detailed tariff options are kept as set on the website.")
    }
    Button(onClick = { model.saveBilling(draft) }, enabled = !state.saving && !section.offline && draft != data) { Text("Save") }
}

@Composable
private fun AlertsPage(state: SettingsState, model: SettingsViewModel) {
    LaunchedEffect(Unit) { model.loadAlerts() }
    val section = state.alerts
    val data = section.data
    if (data == null) {
        if (section.loading) CircularProgressIndicator() else Text(section.error ?: "Alerts are unavailable.", color = MaterialTheme.colorScheme.error)
        return
    }
    val base = remember(data) {
        val have = data.rules
        have + listOf(
            AlertRule("battery", "low_battery", false, true, threshold = null),
            AlertRule("solar-stale", "stale_solar", false, true, threshold = JsonPrimitive(15)),
        ).filter { d -> have.none { it.id == d.id } }
    }
    var rules by remember(base) { mutableStateOf(base) }
    var adding by remember { mutableStateOf(false) }
    fun device(id: String?) = state.devices.firstOrNull { it.id == id }?.title ?: "Unknown device"

    rules.forEach { rule ->
        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val title = when (rule.kind) {
                    "low_battery" -> "Battery is low"
                    "stale_solar" -> "Solar readings stop updating"
                    "device_offline" -> "${device(rule.deviceId)} goes offline"
                    "switch_change" -> "${device(rule.deviceId)} switches on or off"
                    else -> "${device(rule.deviceId)} · ${com.uzairbukhari.photon.data.friendlyLabel(rule.code.orEmpty())}"
                }
                SwitchRow(title, null, rule.enabled) { on -> rules = rules.map { if (it.id == rule.id) it.copy(enabled = on) else it } }
                if (rule.kind == "low_battery" || rule.kind == "stale_solar") {
                    val value = (rule.threshold as? JsonPrimitive)?.content?.toDoubleOrNull()
                    NumberField(
                        if (rule.kind == "low_battery") "Alert below (%) — blank uses your reserve" else "Alert after (minutes without data)",
                        value,
                        { n -> rules = rules.map { if (it.id == rule.id) it.copy(threshold = n?.let(::numberElement)) else it } },
                        Modifier.fillMaxWidth(),
                    )
                }
                if (rule.kind != "low_battery" && rule.kind != "stale_solar") {
                    TextButton(onClick = { rules = rules.filter { it.id != rule.id } }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
    OutlinedButton(onClick = { adding = true }) { Text("Add device alert") }
    Button(onClick = { model.saveAlerts(rules) }, enabled = !state.saving && !section.offline && rules != base) { Text("Save alerts") }
    data.health?.let { h ->
        Hint(
            when {
                h.error != null -> "Last check failed: ${h.error}"
                h.evaluatedAt != null -> "Alerts last checked " + freshnessLabel(parseInstant(h.evaluatedAt)).removePrefix("Updated ")
                else -> "Alerts have not been checked yet."
            },
        )
    }
    if (adding) AddAlertDialog(state.devices, onDismiss = { adding = false }) { rule -> rules = rules + rule; adding = false }
}

@Composable
private fun AddAlertDialog(devices: List<Device>, onDismiss: () -> Unit, onAdd: (AlertRule) -> Unit) {
    var kind by remember { mutableStateOf("device_offline") }
    var deviceId by remember { mutableStateOf<String?>(null) }
    val device = devices.firstOrNull { it.id == deviceId }
    val switchCap = device?.capabilities?.firstOrNull { it.type == "Boolean" && it.code.startsWith("switch") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add device alert") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Picker("Notify me when a device", listOf("device_offline" to "goes offline", "switch_change" to "switches on or off"), kind, { kind = it })
                Picker("Device", devices.map { it.id to it.title }, deviceId, { deviceId = it })
                if (kind == "switch_change" && device != null && switchCap == null) Text("This device has no on/off switch.", color = Hues.Warning)
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(AlertRule("alert-" + newRuleId().removePrefix("rule-"), kind, true, true, deviceId, if (kind == "switch_change") switchCap?.code else null, null, null)) },
                enabled = device != null && (kind == "device_offline" || switchCap != null),
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun AppearancePage(graph: Graph) {
    val theme by graph.prefs.theme.collectAsStateWithLifecycle()
    listOf("system" to "Follow the phone", "light" to "Light", "dark" to "Dark").forEach { (key, label) ->
        Row(Modifier.fillMaxWidth().clickable { graph.prefs.setTheme(key) }, verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = theme == key, onClick = { graph.prefs.setTheme(key) })
            Text(label, color = MaterialTheme.colorScheme.onBackground)
        }
    }
}

@Composable
private fun StoragePage(state: SettingsState, model: SettingsViewModel) {
    LaunchedEffect(Unit) { model.loadStorage() }
    val section = state.storage
    val data = section.data
    if (data == null) {
        if (section.loading) CircularProgressIndicator() else Text(section.error ?: "Storage details are unavailable.", color = MaterialTheme.colorScheme.error)
        return
    }
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (data.schedulerHealthy) "Collection is running" else "Collection looks stalled", color = if (data.schedulerHealthy) Hues.Battery else Hues.Warning, style = MaterialTheme.typography.titleMedium)
            data.databaseBytes?.let { Hint("Database size: %.1f MB".format(it / 1_048_576.0)) }
            data.jobs.filter { it.id == "collection" || it.id == "tuya-live" }.forEach { job ->
                Hint("${job.id}: " + (job.error ?: job.lastSuccess?.let { "last success " + freshnessLabel(parseInstant(it)).removePrefix("Updated ") } ?: "no success yet"))
            }
        }
    }
    if (data.requests.isNotEmpty()) {
        Text("Provider requests, last 24 hours", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onBackground)
        data.requests.forEach { Hint("${it.provider} · ${it.purpose}: ${it.requests} requests, ${it.failures} failed") }
    }
    if (data.counts.isNotEmpty()) {
        Text("Stored records", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onBackground)
        data.counts.forEach { Hint("${it.table}: ${it.records}") }
    }
}

@Composable
private fun AccountPage(graph: Graph) {
    Column {
        Text("Server", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(graph.session.serverUrl.orEmpty().removePrefix("https://"), color = MaterialTheme.colorScheme.onBackground)
    }
    Column {
        Text("App version", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(BuildConfig.VERSION_NAME, color = MaterialTheme.colorScheme.onBackground)
    }
    OutlinedButton(
        onClick = {
            graph.repository.clearAll()
            graph.session.signOut()
        },
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Sign out") }
    Hint("Signing out also clears the readings saved on this phone.")
}
