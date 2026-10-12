package com.uzairbukhari.photon.ui.flow

import android.provider.Settings
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.uzairbukhari.photon.ui.Hues
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

private const val MAX_PARTICLES = 14
private val ParticleOrder = intArrayOf(0, 7, 3, 11, 5, 13, 1, 9, 4, 12, 2, 10, 6, 8)
private val NodeOrder = FlowNode.entries

private fun smooth(edge0: Float, edge1: Float, x: Float): Float {
    val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
    return t * t * (3 - 2 * t)
}

private fun kw(watts: Float) = "%.2f".format(abs(watts) / 1000f)

private fun kw1(watts: Float) = "%.1f".format(abs(watts) / 1000f)

@Composable
private fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
}

/** Glow sprite: white-hot core, soft coloured halo. Drawn additively so overlapping particles bloom. */
private fun renderSprite(color: Color, density: Density): ImageBitmap {
    val size = 64
    val bitmap = ImageBitmap(size, size)
    CanvasDrawScope().draw(density, LayoutDirection.Ltr, androidx.compose.ui.graphics.Canvas(bitmap), androidx.compose.ui.geometry.Size(size.toFloat(), size.toFloat())) {
        val c = Offset(size / 2f, size / 2f)
        drawCircle(
            Brush.radialGradient(
                0f to Color.White, 0.12f to lerp(color, Color.White, 0.5f).copy(alpha = 0.95f),
                0.35f to color.copy(alpha = 0.45f), 1f to color.copy(alpha = 0f),
                center = c, radius = size / 2f,
            ),
            size / 2f, c,
        )
    }
    return bitmap
}

private class Sprites(density: Density) {
    val solar = renderSprite(Hues.Solar, density)
    val grid = renderSprite(Hues.Grid, density)
    val charging = renderSprite(Hues.Charging, density)
    val discharging = renderSprite(Hues.Discharging, density)
    val home = renderSprite(Hues.Home, density)
}

/**
 * Isometric home with live power routing. Particle speed and density follow the watts on each route,
 * routes ease between readings, and the battery crossfades when it flips between charging and discharging.
 */
@Composable
fun EnergyFlow(snapshot: EnergySnapshot, modifier: Modifier = Modifier) {
    val light = MaterialTheme.colorScheme.background.luminance() > 0.5f
    val palette = remember(light) { scenePalette(light) }
    val density = LocalDensity.current
    val haptic = LocalHapticFeedback.current
    val calm = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var selected by rememberSaveable { mutableStateOf<String?>(null) }

    val flows = remember(snapshot.solarW, snapshot.homeW, snapshot.batteryW) { allocateFlows(snapshot.solarW, snapshot.homeW, snapshot.batteryW) }
    val live = snapshot.fresh
    val easing = spring<Float>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessVeryLow)
    val solarW = animateFloatAsState(if (live) flows.solarUsed else 0f, easing, label = "solar")
    val gridW = animateFloatAsState(if (live) flows.grid else 0f, easing, label = "grid")
    val batteryW = animateFloatAsState(if (live) snapshot.batteryW else 0f, easing, label = "battery")
    val homeW = animateFloatAsState(if (live) snapshot.homeW else 0f, easing, label = "home")
    val routeWatts = listOf(solarW, gridW, batteryW, homeW) // same order as FlowNode

    val sprites = remember { Sprites(density) }
    val phases = remember { FloatArray(4) { it * 0.23f } }
    val batteryMix = remember { FloatArray(1) }
    val wattsNow = remember { FloatArray(4) }
    var tick by remember { mutableLongStateOf(0L) }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f / 1.02f).clip(RoundedCornerShape(24.dp))) {
            val widthPx = with(density) { maxWidth.toPx() }
            val heightPx = with(density) { maxHeight.toPx() }
            val iso = remember(widthPx, heightPx) { Iso.fit(widthPx, heightPx) }
            val conduits = remember(iso) { NodeOrder.map { buildConduit(Routes.getValue(it).map { p -> iso.p(p) }, 10f * density.density) } }
            val art = remember(iso, palette) {
                renderSceneArt(IntSize(widthPx.roundToInt().coerceAtLeast(1), heightPx.roundToInt().coerceAtLeast(1)), density, iso, palette)
            }

            // One frame clock drives particles, rings and the battery colour. Nothing recomposes per frame.
            LaunchedEffect(calm, conduits) {
                if (calm) return@LaunchedEffect
                lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                    var last = 0L
                    while (true) {
                        androidx.compose.runtime.withFrameNanos { now ->
                            val dt = if (last == 0L) 0f else ((now - last) / 1e9f).coerceAtMost(0.05f)
                            last = now
                            for (i in 0 until 4) {
                                val w = routeWatts[i].value
                                val speed = particleSpeedDp(abs(w)) * density.density / max(1f, conduits[i].length)
                                val dir = if (w < 0f) -1f else 1f
                                phases[i] = (((phases[i] + dir * speed * dt) % 1f) + 1f) % 1f
                            }
                            val target = if (batteryW.value < 0f) 1f else 0f
                            batteryMix[0] += (target - batteryMix[0]) * min(1f, dt * 3f)
                            tick = now
                        }
                    }
                }
            }

            val summary = remember(snapshot, flows) { describe(snapshot, flows) }
            Canvas(Modifier.fillMaxSize().semantics { contentDescription = summary }) {
                val clock = tick / 1e9f
                drawScene(
                    iso, palette, art, conduits, sprites,
                    watts = wattsNow.also { for (i in 0 until 4) it[i] = routeWatts[i].value },
                    phases = phases, batteryMix = batteryMix[0], clock = clock, soc = snapshot.soc ?: 0f,
                    calm = calm, selected = selected,
                )
            }

            val battery = snapshot.batteryW
            val batteryAccent = when {
                !live || abs(battery) < 20f -> MaterialTheme.colorScheme.onSurfaceVariant
                battery > 0 -> Hues.Charging
                else -> Hues.Discharging
            }
            val batterySub = when {
                abs(battery) < 20f -> "Idle"
                battery > 0 -> "Charging +${kw1(battery)} kW"
                else -> "Discharging −${kw1(battery)} kW"
            }
            val cardW = 124.dp
            val cardH = 82.dp
            fun place(node: FlowNode, dx: Float, dy: Float): IntOffset {
                val a = iso.p(Anchors.getValue(node))
                val w = with(density) { cardW.toPx() }
                val h = with(density) { cardH.toPx() }
                val x = (a.x + dx * density.density - w / 2).coerceIn(0f, max(0f, widthPx - w))
                val y = (a.y + dy * density.density - h / 2).coerceIn(0f, max(0f, heightPx - h))
                return IntOffset(x.roundToInt(), y.roundToInt())
            }
            val select = { node: FlowNode ->
                haptic.performHapticFeedback(HapticFeedbackType.ContextClick)
                selected = if (selected == node.name) null else node.name
            }
            Callout(FlowNode.Solar, kw(snapshot.solarW), "kW",
                if (snapshot.solarW < 20f) "No sun right now" else "${kw1(flows.solarToHome)} home · ${kw1(flows.solarToBattery)} batt",
                Hues.Solar, selected == FlowNode.Solar.name, { select(FlowNode.Solar) },
                Modifier.offset { place(FlowNode.Solar, 70f, -78f) }.size(cardW, cardH))
            Callout(FlowNode.Grid, kw(snapshot.gridW ?: flows.grid), "kW",
                if ((snapshot.gridW ?: flows.grid) < 20f) "Not importing" else "Importing",
                Hues.Grid, selected == FlowNode.Grid.name, { select(FlowNode.Grid) },
                Modifier.offset { place(FlowNode.Grid, -10f, -66f) }.size(cardW, cardH))
            Callout(FlowNode.Battery, snapshot.soc?.let { "%.0f".format(it) } ?: "—", "%",
                batterySub, batteryAccent, selected == FlowNode.Battery.name, { select(FlowNode.Battery) },
                Modifier.offset { place(FlowNode.Battery, -34f, 96f) }.size(cardW, cardH))
            Callout(FlowNode.Home, kw(snapshot.homeW), "kW",
                "${((flows.solarToHome / max(1f, snapshot.homeW)) * 100).roundToInt()}% from solar",
                Hues.Home, selected == FlowNode.Home.name, { select(FlowNode.Home) },
                Modifier.offset { place(FlowNode.Home, 10f, 78f) }.size(cardW, cardH))
        }
        RouteBreakdown(flows, selected?.let { FlowNode.valueOf(it) })
    }
}

private fun describe(s: EnergySnapshot, f: Flows): String {
    val battery = when {
        s.batteryW > 20f -> "charging"
        s.batteryW < -20f -> "discharging"
        else -> "idle"
    }
    val state = if (s.fresh) "" else "Readings are old, so the flow is paused. "
    return state + "Solar ${kw(s.solarW)} kilowatts, home ${kw(s.homeW)} kilowatts, grid import ${kw(s.gridW ?: f.grid)} kilowatts, " +
        "battery ${s.soc?.roundToInt() ?: "unknown"} percent $battery."
}

@Composable
private fun Callout(
    node: FlowNode, value: String, unit: String, sub: String, accent: Color,
    selected: Boolean, onClick: () -> Unit, modifier: Modifier,
) {
    val shown by animateFloatAsState(value.toFloatOrNull() ?: 0f, tween(600), label = "count-${node.name}")
    val text = if (value.toFloatOrNull() == null) value else if (value.contains('.')) "%.2f".format(shown) else "%.0f".format(shown)
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.82f),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) accent else MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
    ) {
        Column(Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 4.dp), verticalArrangement = Arrangement.Center) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(node.label, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = accent, maxLines = 1)
                Text("›", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                Spacer(Modifier.width(3.dp))
                Text(unit, Modifier.padding(bottom = 3.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(sub, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

private fun nodeColor(node: FlowNode, mix: Float): Color = when (node) {
    FlowNode.Solar -> Hues.Solar
    FlowNode.Grid -> Hues.Grid
    FlowNode.Home -> Hues.Home
    FlowNode.Battery -> lerp(Hues.Charging, Hues.Discharging, mix)
}

private fun DrawScope.drawScene(
    iso: Iso, pal: ScenePalette, art: ImageBitmap, conduits: List<Conduit>, sprites: Sprites,
    watts: FloatArray, phases: FloatArray, batteryMix: Float, clock: Float, soc: Float, calm: Boolean, selected: String?,
) {
    val d = density
    val daylight = smooth(0f, 2500f, max(0f, watts[0]))

    // sky, stars and sun
    val top = lerp(pal.skyNightTop, pal.skyDayTop, daylight)
    val bottom = lerp(pal.skyNightBottom, pal.skyDayBottom, daylight)
    drawRect(Brush.verticalGradient(0f to top, 0.75f to bottom, 1f to bottom))
    if (daylight < 0.9f) {
        for (i in 0 until 40) {
            val x = ((i * 97) % 100) / 100f * size.width
            val y = ((i * 53) % 45) / 100f * size.height
            val r = 0.4f + ((i * 31) % 10) / 16f
            val alpha = (1 - daylight) * (0.35f + 0.35f * sin(clock * 1.3f + i))
            drawCircle(Color.White.copy(alpha = alpha.coerceIn(0f, 1f)), r * d, Offset(x, y))
        }
    }
    if (daylight > 0.05f) {
        val sun = Offset(size.width * 0.86f, size.height * 0.1f)
        drawCircle(
            Brush.radialGradient(0f to Color(0xFFFFECAA).copy(alpha = 0.55f * daylight), 1f to Color(0xFFFFECAA).copy(alpha = 0f), center = sun, radius = size.width * 0.35f),
            size.width * 0.35f, sun,
        )
    }
    drawImage(art)

    // a bright band sweeps across the panels while solar is producing
    if (watts[0] > 50f && !calm) {
        val a = iso.p(0.0, 3.6, 7.9)
        val b = iso.p(10.0, 7.5, 4.6)
        val sweep = (clock * 0.25f) % 1.6f - 0.3f
        val alpha = 0.18f * smooth(50f, 3000f, watts[0])
        val roof = Path().apply {
            listOf(v(0.5, 3.9, 7.6), v(10.0, 3.9, 7.6), v(10.0, 7.2, 4.8), v(0.5, 7.2, 4.8)).forEachIndexed { i, p ->
                val o = iso.p(p)
                if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y)
            }
            close()
        }
        clipPath(roof) {
            drawRect(
                Brush.linearGradient(
                    sweep.minus(0.12f).coerceIn(0f, 1f) to Color.White.copy(alpha = 0f),
                    sweep.coerceIn(0f, 1f) to Color.White.copy(alpha = alpha),
                    sweep.plus(0.12f).coerceIn(0f, 1f) to Color.White.copy(alpha = 0f),
                    start = a, end = b,
                ),
            )
        }
    }

    // windows: warm glow scales with home load, more at night
    val load = smooth(100f, 3500f, watts[3]) * (1 - daylight * 0.55f)
    val glass = lerp(pal.windowOff, pal.windowOn, min(1f, 0.15f + load))
    Windows.forEach { (y0, y1) ->
        val ym = (y0 + y1) / 2
        listOf(y0 to ym - 0.05, ym + 0.05 to y1).forEach { (a, b) ->
            listOf(1.6 to 2.57, 2.63 to 3.6).forEach { (z0, z1) ->
                val pane = Path().apply {
                    listOf(v(10.02, a, z0), v(10.02, b, z0), v(10.02, b, z1), v(10.02, a, z1)).forEachIndexed { i, p ->
                        val o = iso.p(p)
                        if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y)
                    }
                    close()
                }
                drawPath(pane, glass)
            }
        }
        if (load > 0.05f) {
            val c = iso.p(10.0, ym, 2.6)
            drawCircle(
                Brush.radialGradient(0f to pal.windowOn.copy(alpha = 0.3f * load), 1f to pal.windowOn.copy(alpha = 0f), center = c, radius = iso.scale * 2.6f),
                iso.scale * 2.6f, c,
            )
        }
    }

    drawBatteryCabinet(iso, pal, soc, nodeColor(FlowNode.Battery, batteryMix))

    // cables: idle slate, glowing in the route colour when power flows
    val additive = if (pal.light) BlendMode.SrcOver else BlendMode.Plus
    for (i in 0 until 4) {
        val node = NodeOrder[i]
        val conduit = conduits[i]
        val active = smooth(0f, 40f, abs(watts[i]))
        val color = nodeColor(node, batteryMix)
        drawPath(conduit.path, pal.conduit.copy(alpha = 0.9f), style = Stroke(3.2f * d, cap = StrokeCap.Round))
        if (active > 0.01f) {
            drawPath(conduit.path, color.copy(alpha = 0.16f * active), style = Stroke(9f * d, cap = StrokeCap.Round), blendMode = additive)
            drawPath(conduit.path, color.copy(alpha = 0.75f * active), style = Stroke(1.6f * d, cap = StrokeCap.Round), blendMode = additive)
        }
    }

    // particles
    for (i in 0 until 4) {
        val node = NodeOrder[i]
        val w = abs(watts[i])
        val active = smooth(0f, 40f, w)
        if (active < 0.01f) continue
        val conduit = conduits[i]
        if (calm) {
            drawArrows(conduit, if (watts[i] < 0f) -1f else 1f, nodeColor(node, batteryMix).copy(alpha = 0.9f * active), d)
            continue
        }
        val count = particleCount(w, conduit.length / d, MAX_PARTICLES)
        val radius = particleRadiusDp(w) * d
        val spriteSize = (radius * 6f).roundToInt().coerceAtLeast(2)
        for (k in 0 until MAX_PARTICLES) {
            val visible = (count - ParticleOrder[k]).coerceIn(0f, 1f) * active
            if (visible < 0.01f) continue
            val f = (phases[i] + k / MAX_PARTICLES.toFloat()) % 1f
            val edge = smooth(0f, 0.06f, f) * smooth(1f, 0.94f, f)
            val at = conduit.at(f)
            val topLeft = IntOffset((at.x - spriteSize / 2f).roundToInt(), (at.y - spriteSize / 2f).roundToInt())
            val sizePx = IntSize(spriteSize, spriteSize)
            val alpha = visible * edge
            if (node == FlowNode.Battery) {
                drawImage(sprites.charging, dstOffset = topLeft, dstSize = sizePx, alpha = alpha * (1 - batteryMix), blendMode = additive)
                drawImage(sprites.discharging, dstOffset = topLeft, dstSize = sizePx, alpha = alpha * batteryMix, blendMode = additive)
            } else {
                val sprite = when (node) {
                    FlowNode.Solar -> sprites.solar
                    FlowNode.Grid -> sprites.grid
                    else -> sprites.home
                }
                drawImage(sprite, dstOffset = topLeft, dstSize = sizePx, alpha = alpha, blendMode = additive)
            }
        }
    }

    // breathing rings: faster around busier nodes, dimmed around the ones you did not tap
    for (i in 0 until 4) {
        val node = NodeOrder[i]
        val w = abs(watts[i])
        val active = smooth(0f, 40f, w)
        val c = iso.p(Anchors.getValue(node))
        val color = nodeColor(node, batteryMix)
        val period = if (calm) 1e9f else 3.2f - 1.8f * smooth(0f, 4000f, w)
        val dim = if (selected != null && selected != node.name) 0.35f else 1f
        for (j in 0 until 2) {
            val phase = ((clock / period) + j / 2f) % 1f
            val r = (9f + 16f * phase) * d
            drawOval(
                color.copy(alpha = ((1 - phase) * 0.55f * max(active, 0.15f) * dim).coerceIn(0f, 1f)),
                topLeft = Offset(c.x - r, c.y - r * 0.62f), size = androidx.compose.ui.geometry.Size(r * 2, r * 1.24f),
                style = Stroke(1.5f * d),
            )
        }
        drawOval(
            color.copy(alpha = 0.25f + 0.6f * active),
            topLeft = Offset(c.x - 4f * d, c.y - 2.6f * d), size = androidx.compose.ui.geometry.Size(8f * d, 5.2f * d),
        )
    }
}

private fun DrawScope.drawArrows(conduit: Conduit, direction: Float, color: Color, d: Float) {
    for (f in listOf(0.3f, 0.7f)) {
        val a = conduit.at(f)
        val b = conduit.at((f + 0.02f * direction).coerceIn(0f, 1f))
        val angle = kotlin.math.atan2(b.y - a.y, b.x - a.x)
        val cosA = kotlin.math.cos(angle)
        val sinA = sin(angle)
        fun pt(x: Float, y: Float) = Offset(a.x + (x * cosA - y * sinA) * d, a.y + (x * sinA + y * cosA) * d)
        val arrow = Path().apply {
            val tip = pt(6f, 0f)
            moveTo(tip.x, tip.y)
            val l = pt(-4f, -4.5f)
            lineTo(l.x, l.y)
            val r = pt(-4f, 4.5f)
            lineTo(r.x, r.y)
            close()
        }
        drawPath(arrow, color)
    }
}

/** The battery cabinet with five charge bars that fill with state of charge, tinted by direction. */
private fun DrawScope.drawBatteryCabinet(iso: Iso, pal: ScenePalette, soc: Float, tint: Color) {
    drawBox(iso, 1.2, 2.8, 7.0, 7.9, 0.0, 2.8, pal.box, pal.boxSide, lerp(pal.box, Color.White, 0.3f))
    val filled = soc.coerceIn(0f, 100f) / 100f * 5f
    for (i in 0 until 5) {
        val z0 = 0.35 + i * 0.4
        val z1 = z0 + 0.28
        val fill = (filled - i).coerceIn(0f, 1f)
        val bar = Path().apply {
            listOf(v(1.45, 7.91, z0), v(2.55, 7.91, z0), v(2.55, 7.91, z1), v(1.45, 7.91, z1)).forEachIndexed { k, p ->
                val o = iso.p(p)
                if (k == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y)
            }
            close()
        }
        drawPath(bar, lerp(pal.conduit, tint, fill).copy(alpha = 0.95f))
    }
}

@Composable
private fun RouteBreakdown(flows: Flows, selected: FlowNode?) {
    val rows = listOf(
        Triple("Solar → Home", flows.solarToHome, Hues.Solar) to setOf(FlowNode.Solar, FlowNode.Home),
        Triple("Solar → Battery", flows.solarToBattery, Hues.Solar) to setOf(FlowNode.Solar, FlowNode.Battery),
        Triple("Battery → Home", flows.batteryToHome, Hues.Discharging) to setOf(FlowNode.Battery, FlowNode.Home),
        Triple("Grid → Home", flows.gridToHome, Hues.Grid) to setOf(FlowNode.Grid, FlowNode.Home),
        Triple("Grid → Battery", flows.gridToBattery, Hues.Grid) to setOf(FlowNode.Grid, FlowNode.Battery),
    )
    val shown = if (selected == null) rows else rows.filter { selected in it.second }
    val peak = max(500f, rows.maxOf { it.first.second })
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row {
                Text(if (selected == null) "Where the power goes" else "${selected.label} routes", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(if (selected == null) "All routes" else "Tap again to close", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            shown.forEach { (row, _) ->
                val (name, watts, color) = row
                val fraction by animateFloatAsState((watts / peak).coerceIn(0f, 1f), tween(600), label = name)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row {
                        Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text("${kw(watts)} kW", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    }
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))) {
                        Box(Modifier.fillMaxWidth(fraction).height(6.dp).clip(RoundedCornerShape(6.dp)).background(color))
                    }
                }
            }
        }
    }
}
