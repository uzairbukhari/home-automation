package com.uzairbukhari.photon.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class FlowInputs(
    val solarW: Double?,
    val homeW: Double?,
    val gridW: Double?,
    val soc: Double?,
    val chargeA: Double?,
    val dischargeA: Double?,
    val mode: String?,
    val reserve: Double,
    val fresh: Boolean,
)

private val NodeWidth = 132.dp
private val NodeHeight = 88.dp
private val CoreSize = 96.dp

/** Solar, battery, home and grid around the inverter, with moving dots along active links. */
@Composable
fun EnergyFlow(input: FlowInputs, modifier: Modifier = Modifier) {
    val solarActive = input.fresh && (input.solarW ?: 0.0) > 5
    val homeActive = input.fresh && (input.homeW ?: 0.0) > 5
    val gridActive = input.fresh && (input.gridW ?: 0.0) > 5
    val charging = input.fresh && (input.chargeA ?: 0.0) > 0.1
    val discharging = input.fresh && (input.dischargeA ?: 0.0) > 0.1

    val pulse = rememberInfiniteTransition(label = "flow")
    val progress by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart), label = "dots")

    BoxWithConstraints(modifier.fillMaxWidth().height(300.dp)) {
        val density = LocalDensity.current
        val width = maxWidth
        val height = maxHeight
        fun px(dp: Dp) = with(density) { dp.toPx() }
        val centre = Offset(px(width) / 2, px(height) / 2)
        val leftEdge = Offset(px(NodeWidth), px(NodeHeight) / 2)
        val rightEdge = Offset(px(width) - px(NodeWidth), px(NodeHeight) / 2)
        val bottomY = px(height) - px(NodeHeight) / 2

        Canvas(Modifier.matchParentSize()) {
            fun link(from: Offset, color: Color, active: Boolean, towardCentre: Boolean) {
                val dim = color.copy(alpha = if (active) 0.55f else 0.18f)
                val path = Path().apply {
                    moveTo(from.x, from.y)
                    val midX = (from.x + centre.x) / 2
                    cubicTo(midX, from.y, midX, centre.y, centre.x, centre.y)
                }
                drawPath(path, dim, style = Stroke(width = 3.dp.toPx()))
                if (active) {
                    for (offset in listOf(0f, 0.5f)) {
                        val t0 = (progress + offset) % 1f
                        val t = if (towardCentre) t0 else 1f - t0
                        drawCircle(color, 4.5.dp.toPx(), pointOnCurve(from, centre, t))
                    }
                }
            }
            link(leftEdge, Hues.Solar, solarActive, towardCentre = true)
            link(rightEdge, Hues.Home, homeActive, towardCentre = false)
            link(Offset(leftEdge.x, bottomY), Hues.Battery, charging || discharging, towardCentre = discharging && !charging)
            link(Offset(rightEdge.x, bottomY), Hues.Grid, gridActive, towardCentre = true)
        }

        FlowNode("Solar", "${kilowatts(input.solarW)} kW", null, Hues.Solar, Modifier.align(Alignment.TopStart))
        FlowNode("Home load", "${kilowatts(input.homeW)} kW", null, Hues.Home, Modifier.align(Alignment.TopEnd))
        FlowNode(
            "Battery",
            input.soc?.let { "%.0f %%".format(it) } ?: "—",
            "${"%.0f".format(input.reserve)}% reserve",
            Hues.Battery,
            Modifier.align(Alignment.BottomStart),
        )
        FlowNode("Grid import", "${kilowatts(input.gridW)} kW", null, Hues.Grid, Modifier.align(Alignment.BottomEnd))

        Surface(
            modifier = Modifier.align(Alignment.Center).size(CoreSize),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                Text("Inverter", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    input.mode ?: "—",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
        }
    }
}

@Composable
private fun FlowNode(title: String, value: String, note: String?, accent: Color, modifier: Modifier) {
    Surface(
        modifier = modifier.size(NodeWidth, NodeHeight),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.6f)),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            if (note != null) Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Point at fraction [t] along the cubic used by the link path (node edge to inverter centre). */
internal fun pointOnCurve(from: Offset, to: Offset, t: Float): Offset {
    val midX = (from.x + to.x) / 2
    val u = 1 - t
    val x = u * u * u * from.x + 3 * u * u * t * midX + 3 * u * t * t * midX + t * t * t * to.x
    val y = u * u * u * from.y + 3 * u * u * t * from.y + 3 * u * t * t * to.y + t * t * t * to.y
    return Offset(x, y)
}
