package com.uzairbukhari.photon.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import kotlin.math.roundToInt
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.uzairbukhari.photon.data.ProviderStatus
import com.uzairbukhari.photon.data.SolarLatest
import com.uzairbukhari.photon.ui.flow.EnergyFlow
import com.uzairbukhari.photon.ui.flow.energySnapshot
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OverviewScreen(model: OverviewViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var showConnections by rememberSaveable { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    // Reload on open, then shortly after each expected 5-minute collection while the screen is visible.
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.load()
                delay(nextPollDelayMs(parseInstant(model.state.value.latest?.updatedAt)))
            }
        }
    }

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { model.load(pull = true) }, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Header(state, onRefresh = model::refreshFromInverter, onToggleConnections = { showConnections = !showConnections })
            state.notice?.let { Banner(it, MaterialTheme.colorScheme.primary) }
            when {
                state.loading -> Row(Modifier.fillMaxWidth().padding(48.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                state.latest == null -> Banner(state.error ?: "No readings yet.", MaterialTheme.colorScheme.error)
                else -> Content(state.latest!!, state, showConnections)
            }
        }
    }
}

@Composable
private fun Header(state: OverviewState, onRefresh: () -> Unit, onToggleConnections: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val observed = parseInstant(state.latest?.updatedAt)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Overview", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
            val subtitle = when {
                state.offline -> "Offline · saved ${freshnessLabel(state.savedAtMillis).removePrefix("Updated ")}"
                state.latest != null -> freshnessLabel(observed)
                else -> ""
            }
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ConnectionChip(state.providers, onToggleConnections)
        IconButton(onClick = { haptic.performHapticFeedback(HapticFeedbackType.ContextClick); onRefresh() }, enabled = !state.refreshing) {
            Icon(Icons.Filled.Refresh, contentDescription = "Collect new readings now", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun Content(latest: SolarLatest, state: OverviewState, showConnections: Boolean) {
    val observed = parseInstant(latest.updatedAt)
    val fresh = !latest.stale && !isStale(observed) && !state.offline
    if (!fresh) {
        Banner(
            if (state.offline) "You're offline. Showing the last saved readings." else "Readings are older than expected, so live flow is paused.",
            Hues.Warning,
        )
    }
    EnergyFlow(energySnapshot(latest, fresh))

    val soc = latest.value("battery_soc")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Metric("Solar today", latest.value("solar_today")?.let { "%.1f".format(it) } ?: "—", "kWh", Hues.Solar, Modifier.weight(1f), big = true)
        Metric(
            "Battery stored",
            soc?.let { "%.1f".format(state.settings.capacity * it / 100) } ?: "—", "kWh", Hues.Charging, Modifier.weight(1f), big = true,
            note = soc?.let { if (it >= state.settings.threshold) "${(it - state.settings.threshold).roundToInt()}% above your ${state.settings.threshold.roundToInt()}% reserve" else "Below your ${state.settings.threshold.roundToInt()}% reserve" },
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Metric("Battery", latest.value("battery_voltage")?.let { "%.1f".format(it) } ?: "—", "V", Hues.Battery, Modifier.weight(1f))
        Metric("Grid", latest.value("grid_voltage")?.let { "%.0f".format(it) } ?: "—", "V", Hues.Grid, Modifier.weight(1f))
        Metric("Inverter load", latest.value("output_load")?.let { "%.0f".format(it) } ?: "—", "%", Hues.Home, Modifier.weight(1f))
    }

    if (showConnections && state.providers.isNotEmpty()) {
        Text("Connections", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
        state.providers.forEach { ProviderRow(it) }
    }
    if (latest.device.name.isNotBlank()) {
        Text(
            "${latest.device.name} · ${latest.device.serial}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Metric(label: String, value: String, unit: String, accent: Color, modifier: Modifier, big: Boolean = false, note: String? = null) {
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(if (big) 16.dp else 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = accent, maxLines = 1)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    value,
                    style = if (big) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1,
                )
                Spacer(Modifier.width(3.dp))
                Text(unit, Modifier.padding(bottom = if (big) 3.dp else 2.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (note != null) Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
    }
}

/** One glanceable status for both providers; tap to show the detail rows. */
@Composable
private fun ConnectionChip(providers: List<ProviderStatus>, onClick: () -> Unit) {
    if (providers.isEmpty()) return
    val allGood = providers.all { it.status == "connected" || it.status == "not_configured" }
    val (text, color) = if (allGood) "Connected" to Hues.Charging else "Needs attention" to Hues.Warning
    Surface(onClick = onClick, shape = RoundedCornerShape(50), color = color.copy(alpha = 0.14f)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).background(color, CircleShape))
            Spacer(Modifier.width(6.dp))
            Text(text, style = MaterialTheme.typography.labelMedium, color = color)
        }
    }
}

@Composable
private fun ProviderRow(provider: ProviderStatus) {
    val name = when (provider.provider) {
        "dessmonitor" -> "Solar inverter (DessMonitor)"
        "tuya" -> "Smart devices (Tuya)"
        else -> provider.provider
    }
    val (text, color) = when (provider.status) {
        "connected" -> "Connected" to Hues.Battery
        "degraded" -> "Needs attention" to Hues.Warning
        else -> "Not set up" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(name, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface)
            Text(text, color = color, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun Banner(text: String, color: Color) {
    Surface(shape = RoundedCornerShape(14.dp), color = color.copy(alpha = 0.14f)) {
        Text(text, Modifier.fillMaxWidth().padding(14.dp), color = color, style = MaterialTheme.typography.bodyMedium)
    }
}
