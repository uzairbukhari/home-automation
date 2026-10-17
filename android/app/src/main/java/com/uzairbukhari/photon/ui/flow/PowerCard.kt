package com.uzairbukhari.photon.ui.flow

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.uzairbukhari.photon.data.DayToday
import com.uzairbukhari.photon.ui.Hues
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

private const val ACTIVE_W = 20f

/** One path power takes between two nodes. */
internal data class Route(val from: FlowNode, val to: FlowNode, val watts: Float, val color: Color) {
    val name get() = "${from.label} → ${to.label}"
    val active get() = watts >= ACTIVE_W
}

internal fun routesOf(f: Flows): List<Route> = listOf(
    Route(FlowNode.Solar, FlowNode.Home, f.solarToHome, Hues.Solar),
    Route(FlowNode.Solar, FlowNode.Battery, f.solarToBattery, Hues.Solar),
    Route(FlowNode.Battery, FlowNode.Home, f.batteryToHome, Hues.Discharging),
    Route(FlowNode.Grid, FlowNode.Home, f.gridToHome, Hues.Grid),
    Route(FlowNode.Grid, FlowNode.Battery, f.gridToBattery, Hues.Grid),
)

/** One plain sentence about where the home's power comes from right now. */
internal fun powerHeadline(s: EnergySnapshot, f: Flows): String {
    if (s.homeW < 50f && f.solarToBattery < ACTIVE_W && f.gridToBattery < ACTIVE_W) return "The home is idle"
    val sources = listOf("solar" to f.solarToHome, "the battery" to f.batteryToHome, "the grid" to f.gridToHome).filter { it.second >= ACTIVE_W }.sortedByDescending { it.second }
    val running = when (sources.size) {
        0 -> "The home is idle"
        1 -> "The home is running on ${sources[0].first}"
        else -> "The home is mostly on ${sources[0].first}, with ${sources.drop(1).joinToString(" and ") { it.first }}"
    }
    val extra = when {
        f.solarToBattery >= ACTIVE_W -> " Spare solar is charging the battery."
        f.gridToBattery >= ACTIVE_W -> " The grid is charging the battery."
        else -> ""
    }
    return "$running.$extra"
}

/** Plain-language detail for one route, shown when its row is tapped. */
internal fun routeDetail(r: Route, f: Flows, s: EnergySnapshot): String {
    val kwText = "%.2f kW".format(Locale.US, r.watts / 1000f)
    if (!r.active) return "Nothing is flowing ${r.name.lowercase()} right now."
    val share = when (r.to) {
        FlowNode.Home -> if (s.homeW > 0f) " That is ${(r.watts / s.homeW * 100).roundToInt()}% of what the home uses." else ""
        else -> {
            val source = when (r.from) { FlowNode.Solar -> f.solarUsed; FlowNode.Grid -> f.grid; else -> r.watts }
            if (source > 0f) " That is ${(r.watts / source * 100).roundToInt()}% of ${r.from.label.lowercase()}'s output." else ""
        }
    }
    val verb = when {
        r.to == FlowNode.Battery -> "charging the battery"
        r.from == FlowNode.Battery -> "powering the home from the battery"
        else -> "powering the home"
    }
    return "$kwText from ${r.from.label.lowercase()} is $verb.$share"
}

/** Where today's home use came from, in kWh. Direct solar is whatever the grid and battery did not cover. */
internal data class DaySources(val solar: Double, val battery: Double, val grid: Double) {
    val total get() = solar + battery + grid
}

internal fun daySources(today: DayToday?): DaySources? {
    val home = today?.homeKwh ?: return null
    if (home <= 0.0) return null
    val grid = (today.gridKwh ?: 0.0).coerceIn(0.0, home)
    val battery = (today.batteryDischargeKwh ?: 0.0).coerceIn(0.0, home - grid)
    return DaySources(home - grid - battery, battery, grid)
}

@Composable
internal fun PowerCard(
    snapshot: EnergySnapshot, flows: Flows, today: DayToday?, selected: FlowNode?, onSelect: (FlowNode?) -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf("now") }
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Where the power goes", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Segmented(tab, listOf("now" to "Now", "today" to "Today")) { tab = it }
            }
            if (tab == "now") NowPane(snapshot, flows, selected, onSelect) else TodayPane(today)
        }
    }
}

@Composable
private fun Segmented(value: String, options: List<Pair<String, String>>, onChange: (String) -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)).padding(2.dp)) {
        options.forEach { (key, label) ->
            val on = key == value
            Text(
                label,
                Modifier.clip(RoundedCornerShape(50)).clickable { onChange(key) }
                    .background(if (on) MaterialTheme.colorScheme.surface else Color.Transparent)
                    .padding(horizontal = 12.dp, vertical = 5.dp),
                style = MaterialTheme.typography.labelMedium,
                color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun NowPane(snapshot: EnergySnapshot, flows: Flows, selected: FlowNode?, onSelect: (FlowNode?) -> Unit) {
    var showIdle by rememberSaveable { mutableStateOf(false) }
    var openRoute by rememberSaveable { mutableStateOf<String?>(null) }
    val all = routesOf(flows)
    val scoped = if (selected == null) all else all.filter { selected == it.from || selected == it.to }
    val active = scoped.filter { it.active }
    val idle = scoped.filterNot { it.active }
    val peak = max(500f, all.maxOf { it.watts })

    Text(powerHeadline(snapshot, flows), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)

    val sources = listOf(
        Triple(FlowNode.Solar, flows.solarToHome, Hues.Solar),
        Triple(FlowNode.Battery, flows.batteryToHome, Hues.Discharging),
        Triple(FlowNode.Grid, flows.gridToHome, Hues.Grid),
    )
    val total = sources.sumOf { it.second.toDouble() }.toFloat()
    if (total >= 50f) {
        Row(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))) {
            sources.filter { it.second > 0f }.forEach { (node, watts, color) ->
                val dim = selected != null && selected != node
                Box(
                    Modifier.weight(watts / total).fillMaxSize().background(color.copy(alpha = if (dim) 0.3f else 1f))
                        .clickable { onSelect(if (selected == node) null else node) },
                )
            }
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        sources.forEach { (node, watts, color) ->
            val on = selected == node
            val pct = if (total >= 50f) (watts / total * 100f).roundToInt() else 0
            Surface(
                onClick = { onSelect(if (on) null else node) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                color = if (on) color.copy(alpha = 0.18f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.15f),
            ) {
                Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                    Text(node.label, style = MaterialTheme.typography.labelMedium, color = color)
                    Text("$pct%", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                    Text("%.2f kW".format(Locale.US, watts / 1000f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }

    if (active.isEmpty()) {
        Text(
            if (selected == null) "No power is moving between the nodes." else "No power is moving to or from ${selected.label.lowercase()}.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    active.forEach { RouteRow(it, peak, openRoute == it.name, routeDetail(it, flows, snapshot)) { openRoute = if (openRoute == it.name) null else it.name } }
    if (idle.isNotEmpty()) {
        Text(
            if (showIdle) "Hide idle routes" else "Show ${idle.size} idle route${if (idle.size == 1) "" else "s"}",
            Modifier.clickable { showIdle = !showIdle }.padding(vertical = 2.dp),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
        )
        AnimatedVisibility(showIdle) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                idle.forEach { RouteRow(it, peak, openRoute == it.name, routeDetail(it, flows, snapshot)) { openRoute = if (openRoute == it.name) null else it.name } }
            }
        }
    }
}

@Composable
private fun RouteRow(route: Route, peak: Float, open: Boolean, detail: String, onClick: () -> Unit) {
    val fraction by animateFloatAsState((route.watts / peak).coerceIn(0f, 1f), tween(600), label = route.name)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row {
            Text(route.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Text("%.2f kW".format(Locale.US, route.watts / 1000f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))) {
            Box(Modifier.fillMaxWidth(fraction).height(6.dp).clip(RoundedCornerShape(6.dp)).background(route.color))
        }
        AnimatedVisibility(open) {
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TodayPane(today: DayToday?) {
    var picked by rememberSaveable { mutableStateOf<String?>(null) }
    val sources = daySources(today)
    if (today == null || sources == null) {
        Text("Today's totals appear once the home has used some energy.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val parts = listOf(
        Triple("Solar", sources.solar, Hues.Solar),
        Triple("Battery", sources.battery, Hues.Discharging),
        Triple("Grid", sources.grid, Hues.Grid),
    )
    val covered = ((1 - sources.grid / sources.total) * 100).roundToInt().coerceIn(0, 100)
    Text(
        "Home used ${"%.1f".format(Locale.US, sources.total)} kWh today, $covered% without the grid.",
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface,
    )
    Row(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))) {
        parts.filter { it.second > 0.0 }.forEach { (name, kwh, color) ->
            Box(
                Modifier.weight(kwh.toFloat()).fillMaxSize().background(color.copy(alpha = if (picked != null && picked != name) 0.3f else 1f))
                    .clickable { picked = if (picked == name) null else name },
            )
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        parts.forEach { (name, kwh, color) ->
            Surface(
                onClick = { picked = if (picked == name) null else name },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                color = if (picked == name) color.copy(alpha = 0.18f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.15f),
            ) {
                Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                    Text(name, style = MaterialTheme.typography.labelMedium, color = color)
                    Text("%.1f kWh".format(Locale.US, kwh), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                    Text("${(kwh / sources.total * 100).roundToInt()}% of use", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    picked?.let { Text(sourceNote(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        today.solarKwh?.let { Line("Solar produced", "%.1f kWh".format(Locale.US, it)) }
        today.batteryChargeKwh?.let { Line("Battery charged", "%.1f kWh".format(Locale.US, it)) }
        today.batteryDischargeKwh?.let { Line("Battery discharged", "%.1f kWh".format(Locale.US, it)) }
        today.gridKwh?.let { Line("Grid imported", "%.1f kWh".format(Locale.US, it)) }
    }
}

private fun sourceNote(name: String) = when (name) {
    "Solar" -> "Solar used directly by the home, before it touched the battery."
    "Battery" -> "Stored energy the battery gave back to the home."
    else -> "Imported from the grid. Lower is better."
}

@Composable
private fun Line(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    }
}
