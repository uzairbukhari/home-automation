package com.uzairbukhari.photon.ui.flow

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** A point in house space: x along the left wall, y toward the viewer, z up. */
data class V3(val x: Double, val y: Double, val z: Double)

fun v(x: Double, y: Double, z: Double) = V3(x, y, z)

/** Isometric projection of house space onto the canvas. */
class Iso(val scale: Float, private val ox: Float, private val oy: Float) {
    fun p(x: Double, y: Double, z: Double) =
        Offset(ox + ((x - y) * 0.866 * scale).toFloat(), oy + (((x + y) * 0.5 - z) * scale).toFloat())

    fun p(point: V3) = p(point.x, point.y, point.z)

    companion object {
        private fun raw(x: Double, y: Double, z: Double) = doubleArrayOf((x - y) * 0.866, (x + y) * 0.5 - z)

        /** Fits the house, tower and cables into a canvas of [width] by [height] pixels. */
        fun fit(width: Float, height: Float): Iso {
            val corners = listOf(
                raw(-3.4, 11.4, 0.0), raw(-2.5, 10.5, 8.6), raw(-4.4, 10.5, 6.4), raw(10.6, 0.0, 0.0),
                raw(10.4, -0.6, 4.5), raw(0.0, 3.5, 8.1), raw(6.5, 10.8, 0.0),
            )
            val minX = corners.minOf { it[0] }
            val maxX = corners.maxOf { it[0] }
            val minY = corners.minOf { it[1] }
            val maxY = corners.maxOf { it[1] }
            val scale = min(width * 0.9f / (maxX - minX).toFloat(), height * 0.74f / (maxY - minY).toFloat())
            return Iso(
                scale,
                width * 0.52f - ((maxX + minX) / 2 * scale).toFloat(),
                height * 0.52f - ((maxY + minY) / 2 * scale).toFloat(),
            )
        }
    }
}

/** Where each node's ring and callout anchor, in house space. */
val Anchors: Map<FlowNode, V3> = mapOf(
    FlowNode.Solar to v(5.0, 5.2, 6.6),
    FlowNode.Grid to v(-2.5, 10.5, 8.6),
    FlowNode.Battery to v(2.0, 7.45, 2.9),
    FlowNode.Home to v(10.3, 6.1, 2.5),
)

/** Cable routes, always drawn from the source toward the inverter or home; negative power runs them backwards. */
val Routes: Map<FlowNode, List<V3>> = mapOf(
    FlowNode.Solar to listOf(v(6.1, 7.12, 4.92), v(6.1, 7.62, 4.5), v(6.1, 7.62, 3.75), v(6.1, 7.22, 3.32)),
    FlowNode.Grid to listOf(v(-0.6, 10.5, 5.75), v(-0.6, 10.5, 0.05), v(6.1, 10.5, 0.05), v(6.1, 7.05, 0.05), v(6.1, 7.05, 2.0)),
    FlowNode.Battery to listOf(v(5.5, 7.05, 2.65), v(3.0, 7.05, 2.65), v(3.0, 7.05, 1.4), v(2.8, 7.45, 1.4)),
    FlowNode.Home to listOf(v(6.7, 7.05, 2.65), v(9.98, 7.05, 2.65), v(10.03, 6.9, 2.65), v(10.03, 6.55, 2.65)),
)

/** Window spans along the right wall (y0, y1). */
val Windows = listOf(0.9 to 2.5, 3.1 to 4.7)

/** A cable with rounded corners, sampled by arc length so particle positions are a table lookup. */
class Conduit(val path: Path, private val xs: FloatArray, private val ys: FloatArray, val length: Float) {
    fun at(fraction: Float): Offset {
        val position = fraction.coerceIn(0f, 1f) * (xs.size - 1)
        val i = min(xs.size - 2, position.toInt())
        val t = position - i
        return Offset(xs[i] + (xs[i + 1] - xs[i]) * t, ys[i] + (ys[i + 1] - ys[i]) * t)
    }
}

fun buildConduit(points: List<Offset>, cornerRadius: Float, samples: Int = 120): Conduit {
    val dense = ArrayList<Offset>()
    dense.add(points.first())
    for (i in 1 until points.size - 1) {
        val a = points[i - 1]
        val b = points[i]
        val c = points[i + 1]
        val d1 = hypot(b.x - a.x, b.y - a.y)
        val d2 = hypot(c.x - b.x, c.y - b.y)
        val r = min(cornerRadius, min(d1 / 2, d2 / 2))
        val p1 = Offset(b.x - (b.x - a.x) * r / max(d1, 0.001f), b.y - (b.y - a.y) * r / max(d1, 0.001f))
        val p2 = Offset(b.x + (c.x - b.x) * r / max(d2, 0.001f), b.y + (c.y - b.y) * r / max(d2, 0.001f))
        for (step in 0..8) {
            val t = step / 8f
            val u = 1 - t
            dense.add(Offset(u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, u * u * p1.y + 2 * u * t * b.y + t * t * p2.y))
        }
    }
    dense.add(points.last())

    val path = Path().apply {
        moveTo(dense[0].x, dense[0].y)
        for (i in 1 until dense.size) lineTo(dense[i].x, dense[i].y)
    }
    val cumulative = FloatArray(dense.size)
    for (i in 1 until dense.size) cumulative[i] = cumulative[i - 1] + hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y)
    val total = cumulative.last()
    val xs = FloatArray(samples + 1)
    val ys = FloatArray(samples + 1)
    var j = 0
    for (i in 0..samples) {
        val distance = i.toFloat() / samples * total
        while (j < dense.size - 2 && cumulative[j + 1] < distance) j++
        val span = cumulative[j + 1] - cumulative[j]
        val t = if (span <= 0f) 0f else (distance - cumulative[j]) / span
        xs[i] = dense[j].x + (dense[j + 1].x - dense[j].x) * t
        ys[i] = dense[j].y + (dense[j + 1].y - dense[j].y) * t
    }
    return Conduit(path, xs, ys, total)
}
