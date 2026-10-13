package com.uzairbukhari.photon.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.uzairbukhari.photon.data.BatteryStats
import com.uzairbukhari.photon.data.Bucket
import com.uzairbukhari.photon.data.EnergyGroup
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Solar = Hues.Solar
private val Home = Hues.Home
private val Grid = Hues.Grid

fun kwh(value: Double?): String = if (value == null) "—" else "%.1f kWh".format(Locale.US, value)
fun rupees(value: Double?): String = if (value == null) "—" else "Rs " + "%,.0f".format(Locale.US, value)

private fun clock(text: String, pattern: String): String = runCatching {
    DateTimeFormatter.ofPattern(pattern, Locale.US).withZone(ZoneId.systemDefault()).format(Instant.parse(text))
}.getOrDefault(text.take(10))

@Composable
fun EnergyScreen(model: EnergyViewModel) {
    var tab by rememberSaveable { mutableStateOf(0) }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text(
            "Energy",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 8.dp),
        )
        TabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Power", "Totals", "Battery", "Appliances").forEachIndexed { i, name -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(name) }) }
        }
        when (tab) {
            0 -> PowerTab(model)
            1 -> TotalsTab(model)
            2 -> BatteryTab(model)
            else -> AppliancesTab(model)
        }
    }
}

@Composable
private fun ScrollColumn(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { content() }
}

@Composable
private fun <T> Loading(section: Section<T>, content: @Composable (T) -> Unit) {
    when {
        section.data != null -> {
            if (section.offline) Note("Offline · showing the last saved copy.")
            content(section.data)
        }
        section.loading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        section.error != null -> Text(section.error, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun Note(text: String) = Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun Card(content: @Composable () -> Unit) {
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = color)
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun RangeChips(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(options) { (key, label) -> FilterChip(selected = selected == key, onClick = { onSelect(key) }, label = { Text(label) }) }
    }
}

@Composable
private fun PowerTab(model: EnergyViewModel) {
    val state by model.history.collectAsStateWithLifecycle()
    var range by rememberSaveable { mutableStateOf("24h") }
    LaunchedEffect(range) { model.loadHistory(range) }
    ScrollColumn {
        RangeChips(HISTORY_RANGES, range) { range = it }
        Loading(state) { data ->
            val series = data.series
            if (series.size < 2) {
                Note("Not enough readings in this range yet.")
                return@Loading
            }
            val pattern = if (data.granularity == "day") "d MMM" else "d MMM HH:mm"
            val start = clock(series.first().sourceTimestamp, pattern)
            val end = clock(series.last().sourceTimestamp, pattern)
            Card {
                Text("Power", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                LineChart(
                    series = listOf(
                        ChartSeries("Solar", Solar, series.map { it.solar?.div(1000) }),
                        ChartSeries("Home", Home, series.map { it.home?.div(1000) }),
                        ChartSeries("Grid", Grid, series.map { it.grid?.div(1000) }),
                    ),
                    startLabel = start, endLabel = end, unit = "kW",
                )
            }
            Card {
                Text("Battery", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                LineChart(
                    series = listOf(ChartSeries("Charge", Hues.Battery, series.map { it.battery })),
                    startLabel = start, endLabel = end, unit = "%", yMax = 100.0,
                )
            }
            data.note?.let { Note(it) }
            Note("${data.sampleCount} readings")
        }
    }
}

@Composable
private fun TotalsTab(model: EnergyViewModel) {
    val state by model.reports.collectAsStateWithLifecycle()
    var year by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(year) { model.loadReports(year) }
    ScrollColumn {
        Loading(state) { data ->
            Card {
                Text("Solar production", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Today", kwh(data.production.today), Solar)
                    Stat("This month", kwh(data.production.month), Solar)
                    Stat("This year", kwh(data.production.year), Solar)
                }
                Stat("Lifetime", kwh(data.production.lifetime), Solar)
            }
            Card {
                Text("This month", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Home used", kwh(data.month.homeKwh), Home)
                    Stat("From grid", kwh(data.month.gridKwh), Grid)
                    Stat("From solar", kwh(data.month.solarKwh), Solar)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Battery in", kwh(data.month.batteryChargeKwh), Hues.Battery)
                    Stat("Battery out", kwh(data.month.batteryDischargeKwh), Hues.Battery)
                }
                Note(data.gridMeter?.let { "Grid import is measured by your $it." } ?: "Grid import is integrated from the inverter.")
            }
            data.savings?.let { savings ->
                Card {
                    Text("Savings this billing cycle", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(rupees(savings.total), style = MaterialTheme.typography.headlineMedium, color = Hues.Battery, fontWeight = FontWeight.SemiBold)
                    Note("${savings.from} to ${savings.to}" + if (savings.provisional) " · provisional" else "")
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Stat("Energy", rupees(savings.energy), MaterialTheme.colorScheme.onSurfaceVariant)
                        Stat("Taxes", rupees(listOfNotNull(savings.gst, savings.duty, savings.income, savings.surcharge).takeIf { it.isNotEmpty() }?.sum()), MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    data.previousCycles.forEach { Note("Previous cycle ${it.from} to ${it.to}: ${rupees(it.total)}") }
                }
            }
            val days = data.buckets.daily
            if (days.isNotEmpty()) Card {
                Text("Last 7 days", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                BarChart(days.map { it.date.takeLast(5) }, bucketSeries(days), "kWh per day")
            }
            val months = data.buckets.monthly
            if (months.any { it.solar != null || it.home != null }) Card {
                Text("Months of ${data.selectedYear}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                BarChart(months.map { it.date.takeLast(2) }, bucketSeries(months), "kWh per month")
                if (data.availableYears.size > 1) {
                    Spacer(Modifier.height(4.dp))
                    RangeChips(data.availableYears.map { it to it }, data.selectedYear) { year = it }
                }
            }
            data.warnings.forEach { Note(it) }
        }
    }
}

private fun num(value: Double?, digits: Int = 1): String = if (value == null) "—" else "%,.${digits}f".format(Locale.US, value)

@Composable
private fun BatteryTab(model: EnergyViewModel) {
    val state by model.battery.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.loadBattery() }
    ScrollColumn {
        Loading(state) { stats ->
            val warranty = stats.warrantyCycles
            val used = stats.warrantyUsedPct
            Card {
                Text("Equivalent cycles", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(num(stats.cycles, 1), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = Hues.Battery)
                    Text("  of ${"%,d".format(Locale.US, warranty)}", Modifier.padding(bottom = 4.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(Modifier.fillMaxWidth().height(6.dp), shape = RoundedCornerShape(3.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Box(Modifier.fillMaxWidth(((used ?: 0.0) / 100).toFloat().coerceIn(0.015f, 1f)).height(6.dp)) {
                        Surface(Modifier.fillMaxSize(), shape = RoundedCornerShape(3.dp), color = Hues.Battery) {}
                    }
                }
                Note(if (stats.cycles == null) "Waiting for recorded battery readings." else "${num(stats.cyclesRemaining, 0)} cycles left in your warranty · ${num(used, 2)}% used")
            }
            Card {
                Text("Estimated health", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(stats.health?.let { num(it.pct, 0) + "%" } ?: "—", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = Hues.Battery)
                Note(
                    stats.health?.let { "About ${num(it.estimatedCapacityKwh, 1)} of ${num(stats.capacityKwh, 1)} kWh usable, from ${it.samples} deep-cycle days." }
                        ?: "Needs 3 days with a 20%+ swing in charge (${stats.healthDays} so far).",
                )
            }
            Card {
                Text("Projected warranty life", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                val years = stats.yearsRemaining
                Text(
                    if (years == null) "—" else (if (years > 30) "30+" else num(years, 1)) + " years",
                    style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = Hues.Battery,
                )
                Note(if (stats.cyclesPerDay == null) "Needs recent usage to project." else "At your recent pace of ${num(stats.cyclesPerDay, 2)} cycles a day.")
            }
            Card {
                BatteryRow("Lifetime throughput", num(stats.throughputKwh, 1) + " kWh")
                BatteryRow("Cycles, last 30 days", num(stats.cyclesLast30, 1))
                BatteryRow("Average depth of discharge", stats.avgDepthPct?.let { num(it, 0) + "%" } ?: "—")
                BatteryRow("Deepest day", stats.deepestPct?.let { num(it, 0) + "%" } ?: "—")
            }
            if (stats.daily.isNotEmpty()) Card {
                Text("Cycles per day · last ${stats.daily.size} days", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                BarChart(stats.daily.map { it.date.takeLast(5) }, listOf(ChartSeries("Cycles", Hues.Battery, stats.daily.map { it.cycles })), "cycles per day")
            }
            Note(batteryFootnote(stats))
        }
    }
}

private fun batteryFootnote(stats: BatteryStats): String =
    (if (stats.since != null) "Tracking since ${stats.since}, ${stats.trackedDays} days. " else "") +
        "A cycle is ${num(stats.capacityKwh, 1)} kWh discharged. Health is an estimate from energy per percent of charge, assuming 97% one-way efficiency; your battery does not report state of health."

@Composable
private fun BatteryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    }
}

private fun bucketSeries(buckets: List<Bucket>) = listOf(
    ChartSeries("Solar", Solar, buckets.map { it.solar }),
    ChartSeries("Home", Home, buckets.map { it.home }),
    ChartSeries("Grid", Grid, buckets.map { it.grid }),
)

@Composable
private fun AppliancesTab(model: EnergyViewModel) {
    val state by model.appliances.collectAsStateWithLifecycle()
    var range by rememberSaveable { mutableStateOf("month") }
    LaunchedEffect(range) { model.loadAppliances(range) }
    ScrollColumn {
        RangeChips(APPLIANCE_RANGES, range) { range = it }
        Loading(state) { data ->
            Card {
                Text("Whole home · ${data.from} to ${data.to}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Home used", kwh(data.household.homeKwh), Home)
                    Stat("From grid", kwh(data.household.gridKwh), Grid)
                    Stat("Monitored", kwh(data.household.monitoredKwh), Hues.Battery)
                }
                data.household.warning?.let { Text(it, color = Hues.Warning, style = MaterialTheme.typography.bodySmall) }
                if (data.household.partial) Note("Some days are missing, so totals are partial.")
            }
            GroupCard("By room", data.rooms)
            GroupCard("By device", data.devices)
            data.assumptions.forEach { Note(it) }
        }
    }
}

@Composable
private fun GroupCard(title: String, groups: List<EnergyGroup>) {
    val ranked = groups.filter { it.energyKwh != null }.sortedByDescending { it.energyKwh }
    if (ranked.isEmpty()) return
    Card {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        val top = ranked.first().energyKwh ?: 1.0
        ranked.forEach { group ->
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(group.name.ifBlank { group.id }, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                    Text(kwh(group.energyKwh) + (group.estimatedCost?.let { " · ${rupees(it)}" } ?: ""), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.height(4.dp))
                Surface(Modifier.fillMaxWidth().height(6.dp), shape = RoundedCornerShape(3.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Box(Modifier.fillMaxWidth(((group.energyKwh ?: 0.0) / top).toFloat().coerceIn(0.02f, 1f)).height(6.dp).padding(0.dp)) {
                        Surface(Modifier.fillMaxSize(), shape = RoundedCornerShape(3.dp), color = Home) {}
                    }
                }
            }
        }
    }
}
