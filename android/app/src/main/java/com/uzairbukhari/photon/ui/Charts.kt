package com.uzairbukhari.photon.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.ceil
import kotlin.math.log10
import kotlin.math.pow

data class ChartSeries(val name: String, val color: Color, val values: List<Double?>)

/** Rounds a maximum up to a tidy axis end: 1, 2, 2.5 or 5 times a power of ten. */
fun niceMax(value: Double): Double {
    if (value <= 0.0) return 1.0
    val power = 10.0.pow(ceil(log10(value)) - 1)
    return listOf(1.0, 2.0, 2.5, 5.0, 10.0).map { it * power }.first { it >= value }
}

@Composable
private fun Legend(series: List<ChartSeries>) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        series.forEach {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Column(Modifier.size(10.dp).background(it.color, CircleShape)) {}
                Text(it.name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Line chart with gaps for missing values; [yMax] null picks a tidy maximum from the data. */
@Composable
fun LineChart(
    series: List<ChartSeries>,
    startLabel: String,
    endLabel: String,
    unit: String,
    modifier: Modifier = Modifier,
    height: Dp = 200.dp,
    yMax: Double? = null,
) {
    val grid = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
    val textColor = MaterialTheme.colorScheme.onSurfaceVariant
    val top = yMax ?: niceMax(series.flatMap { it.values }.filterNotNull().maxOrNull() ?: 0.0)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Legend(series)
        Row {
            Column(Modifier.height(height), verticalArrangement = Arrangement.SpaceBetween) {
                listOf(top, top / 2, 0.0).forEach { Text(axisLabel(it), style = MaterialTheme.typography.labelSmall, color = textColor) }
            }
            Canvas(Modifier.fillMaxWidth().height(height).padding(start = 8.dp)) {
                for (i in 0..2) {
                    val y = size.height * i / 2f
                    drawLine(grid, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
                }
                series.forEach { s ->
                    if (s.values.size < 2) return@forEach
                    val path = Path()
                    var open = false
                    s.values.forEachIndexed { index, value ->
                        if (value == null) { open = false; return@forEachIndexed }
                        val x = size.width * index / (s.values.size - 1)
                        val y = size.height * (1 - (value / top).toFloat().coerceIn(0f, 1f))
                        if (open) path.lineTo(x, y) else { path.moveTo(x, y); open = true }
                    }
                    drawPath(path, s.color, style = Stroke(width = 2.dp.toPx()))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 36.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(startLabel, style = MaterialTheme.typography.labelSmall, color = textColor)
            Text(unit, style = MaterialTheme.typography.labelSmall, color = textColor)
            Text(endLabel, style = MaterialTheme.typography.labelSmall, color = textColor)
        }
    }
}

/** Grouped bars: one group per label, one bar per series. */
@Composable
fun BarChart(
    labels: List<String>,
    series: List<ChartSeries>,
    unit: String,
    modifier: Modifier = Modifier,
    height: Dp = 180.dp,
) {
    val grid = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
    val textColor = MaterialTheme.colorScheme.onSurfaceVariant
    val top = niceMax(series.flatMap { it.values }.filterNotNull().maxOrNull() ?: 0.0)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Legend(series)
        Row {
            Column(Modifier.height(height), verticalArrangement = Arrangement.SpaceBetween) {
                listOf(top, top / 2, 0.0).forEach { Text(axisLabel(it), style = MaterialTheme.typography.labelSmall, color = textColor) }
            }
            Canvas(Modifier.fillMaxWidth().height(height).padding(start = 8.dp)) {
                for (i in 0..2) {
                    val y = size.height * i / 2f
                    drawLine(grid, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
                }
                if (labels.isEmpty()) return@Canvas
                val groupWidth = size.width / labels.size
                val barWidth = (groupWidth * 0.8f / series.size.coerceAtLeast(1))
                labels.indices.forEach { g ->
                    series.forEachIndexed { s, item ->
                        val value = item.values.getOrNull(g) ?: return@forEachIndexed
                        val h = size.height * (value / top).toFloat().coerceIn(0f, 1f)
                        drawRoundRect(
                            item.color,
                            Offset(g * groupWidth + groupWidth * 0.1f + s * barWidth, size.height - h),
                            Size((barWidth - 2.dp.toPx()).coerceAtLeast(1f), h),
                            CornerRadius(3.dp.toPx()),
                        )
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 36.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            val every = ((labels.size + 5) / 6).coerceAtLeast(1)
            labels.forEachIndexed { index, label ->
                Text(if (index % every == 0) label else "", style = MaterialTheme.typography.labelSmall, color = textColor, maxLines = 1)
            }
        }
        Text(unit, style = MaterialTheme.typography.labelSmall, color = textColor)
    }
}

private fun axisLabel(value: Double): String = if (value >= 10 || value == 0.0) "%.0f".format(value) else "%.1f".format(value)
