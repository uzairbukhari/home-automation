package com.uzairbukhari.photon.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.uzairbukhari.photon.data.ActivityItem
import com.uzairbukhari.photon.data.AutomationRule
import com.uzairbukhari.photon.data.RuleEntry
import com.uzairbukhari.photon.data.describeAction
import com.uzairbukhari.photon.data.describeCondition
import kotlinx.coroutines.delay

private fun statusColor(status: String) = when (status) {
    "triggered", "confirmed" -> Hues.Battery
    "blocked", "failed" -> Hues.Warning
    else -> Color.Gray
}


@Composable
fun AutomationsScreen(model: AutomationsViewModel, onMessage: (String) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var tab by rememberSaveable { mutableStateOf(0) }
    var editing by remember { mutableStateOf<AutomationRule?>(null) }
    var creating by remember { mutableStateOf(false) }

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.load()
                delay(30_000)
            }
        }
    }
    LaunchedEffect(state.message) {
        state.message?.let { onMessage(it); model.dismissMessage() }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Automations", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                    Text(
                        if (state.snapshot.paused) "All rules are paused" else "${state.snapshot.rules.count { it.rule.enabled }} of ${state.snapshot.rules.size} rules on",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (state.snapshot.paused) Hues.Warning else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text("Pause all", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                Switch(checked = state.snapshot.paused, onCheckedChange = model::setPaused, enabled = !state.offline, modifier = Modifier.padding(horizontal = 8.dp))
            }
            TabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                listOf("Rules", "Activity").forEachIndexed { i, name -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(name) }) }
            }
            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                tab == 0 -> RulesList(state, model, onEdit = { editing = it })
                else -> ActivityList(state, model)
            }
        }
        if (!state.offline) {
            FloatingActionButton(onClick = { creating = true }, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
                Icon(Icons.Filled.Add, contentDescription = "New automation")
            }
        }
    }

    if (creating || editing != null) {
        val existing = editing
        RuleEditor(
            initial = existing ?: blankRule(),
            devices = state.devices,
            isNew = existing == null,
            simulation = state.simulation,
            onSave = { model.save(it); creating = false; editing = null; model.clearSimulation() },
            onTest = model::simulate,
            onDelete = { existing?.let(model::delete); editing = null; model.clearSimulation() },
            onClose = { creating = false; editing = null; model.clearSimulation() },
        )
    }
}

@Composable
private fun RulesList(state: AutomationsState, model: AutomationsViewModel, onEdit: (AutomationRule) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 12.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.error != null && state.snapshot.rules.isEmpty()) item { Text(state.error, color = MaterialTheme.colorScheme.error) }
        if (state.snapshot.rules.isEmpty() && state.error == null) item {
            Text("No automations yet. Tap + to create one, for example turn off a heater when the battery gets low.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.snapshot.rules, key = { it.rule.id }) { entry -> RuleCard(entry, model, enabled = !state.offline, onEdit) }
    }
}

@Composable
private fun RuleCard(entry: RuleEntry, model: AutomationsViewModel, enabled: Boolean, onEdit: (AutomationRule) -> Unit) {
    val rule = entry.rule
    Surface(Modifier.fillMaxWidth().clickable { onEdit(rule) }, shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(rule.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        when {
                            !rule.enabled -> "Off"
                            entry.state?.active == true -> "Active now"
                            else -> entry.state?.reason ?: "Waiting"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (entry.state?.active == true && rule.enabled) Hues.Battery else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = rule.enabled, onCheckedChange = { model.setEnabled(rule, it) }, enabled = enabled)
            }
            rule.conditions.forEach { Text("When " + describeCondition(it, model::deviceName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            rule.actions.forEach { Text(describeAction(it, model::deviceName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface) }
        }
    }
}

@Composable
private fun ActivityList(state: AutomationsState, model: AutomationsViewModel) {
    // The log records every check; "Unmatched" is the constant background noise, so it is hidden unless asked for.
    var showUnmatched by rememberSaveable { mutableStateOf(false) }
    val shown = if (showUnmatched) state.activity else state.activity.filter { it.status != "unmatched" }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            androidx.compose.material3.FilterChip(selected = showUnmatched, onClick = { showUnmatched = !showUnmatched }, label = { Text("Show unmatched checks") })
        }
        if (shown.isEmpty()) item { Text(if (state.activity.isEmpty()) "Nothing has happened yet." else "No rule has matched recently.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(shown, key = { it.id }) { ActivityRow(it) }
        if (state.nextCursor != null) item { TextButton(onClick = model::loadMoreActivity) { Text("Show older") } }
    }
}

@Composable
private fun ActivityRow(item: ActivityItem) {
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(item.name.ifBlank { item.ruleId }, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(item.status.replaceFirstChar { it.uppercase() }, color = statusColor(item.status), style = MaterialTheme.typography.labelMedium, maxLines = 1, softWrap = false, modifier = Modifier.padding(start = 8.dp))
            }
            Text(item.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(freshnessLabel(parseInstant(item.occurredAt)).removePrefix("Updated "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
