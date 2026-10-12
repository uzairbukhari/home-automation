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
            Header(state, onRefresh = model::refreshFromInverter)
            state.notice?.let { Banner(it, MaterialTheme.colorScheme.primary) }
            when {
                state.loading -> Row(Modifier.fillMaxWidth().padding(48.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                state.latest == null -> Banner(state.error ?: "No readings yet.", MaterialTheme.colorScheme.error)
                else -> Content(state.latest!!, state)
            }
        }
    }
}

@Composable
private fun Header(state: OverviewState, onRefresh: () -> Unit) {
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
        IconButton(onClick = onRefresh, enabled = !state.refreshing) {
            Icon(Icons.Filled.Refresh, contentDescription = "Collect new readings now", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun Content(latest: SolarLatest, state: OverviewState) {
    val observed = parseInstant(latest.updatedAt)
    val fresh = !latest.stale && !isStale(observed) && !state.offline
    if (!fresh) {
        Banner(
            if (state.offline) "You're offline. Showing the last saved readings." else "Readings are older than expected, so live flow is paused.",
            Hues.Warning,
        )
    }
    EnergyFlow(energySnapshot(latest, fresh))

    val tiles = listOf(
        Triple("Solar today", latest.value("solar_today")?.let { "%.1f kWh".format(it) } ?: "—", Hues.Solar),
        Triple("Battery voltage", latest.value("battery_voltage")?.let { "%.1f V".format(it) } ?: "—", Hues.Battery),
        Triple("Grid voltage", latest.value("grid_voltage")?.let { "%.0f V".format(it) } ?: "—", Hues.Grid),
        Triple("Inverter load", latest.value("output_load")?.let { "%.0f %%".format(it) } ?: "—", Hues.Home),
    )
    tiles.chunked(2).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            row.forEach { (label, value, color) -> Metric(label, value, color, Modifier.weight(1f)) }
        }
    }

    if (state.providers.isNotEmpty()) {
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
private fun Metric(label: String, value: String, accent: Color, modifier: Modifier) {
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = accent)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
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
