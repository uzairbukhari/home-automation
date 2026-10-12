package com.uzairbukhari.photon.ui.flow

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** Draws the house, tower, panels and fixtures once into a bitmap; only size or theme changes redraw it. */
fun renderSceneArt(size: IntSize, density: Density, iso: Iso, palette: ScenePalette): ImageBitmap {
    val bitmap = ImageBitmap(size.width, size.height)
    CanvasDrawScope().draw(density, LayoutDirection.Ltr, Canvas(bitmap), androidx.compose.ui.geometry.Size(size.width.toFloat(), size.height.toFloat())) {
        drawSceneArt(iso, palette)
    }
    return bitmap
}

private fun DrawScope.poly(iso: Iso, points: List<V3>, color: Color) = drawPath(polyPath(iso, points), color)

private fun DrawScope.poly(iso: Iso, points: List<V3>, brush: Brush) = drawPath(polyPath(iso, points), brush)

private fun polyPath(iso: Iso, points: List<V3>): Path = Path().apply {
    points.forEachIndexed { i, point ->
        val o = iso.p(point)
        if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y)
    }
    close()
}

/** A box seen from the front (+y), right (+x) and top. */
fun DrawScope.drawBox(
    iso: Iso, x0: Double, x1: Double, y0: Double, y1: Double, z0: Double, z1: Double,
    front: Color, side: Color, top: Color,
) {
    poly(iso, listOf(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)), front)
    poly(iso, listOf(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)), side)
    poly(iso, listOf(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)), top)
}

private fun DrawScope.line(iso: Iso, a: V3, b: V3, color: Color, width: Float) {
    drawLine(color, iso.p(a), iso.p(b), strokeWidth = width, cap = StrokeCap.Round)
}

private fun lighten(c: Color, t: Float) = lerp(c, Color.White, t)

private fun darken(c: Color, t: Float) = lerp(c, Color.Black, t)

private fun DrawScope.drawSceneArt(iso: Iso, pal: ScenePalette) {
    val boxTop = lighten(pal.box, 0.3f)
    val ink = Color(0xFF142034)

    // ground pad
    val pad = iso.p(4.0, 8.0, 0.0)
    val padRadius = iso.scale * 11f
    withTransform({
        translate(pad.x, pad.y)
        scale(1f, 0.5f, Offset.Zero)
    }) {
        drawCircle(
            Brush.radialGradient(0f to pal.ground.copy(alpha = 0.95f), 1f to pal.ground.copy(alpha = 0f), center = Offset.Zero, radius = padRadius),
            padRadius, Offset.Zero,
        )
    }

    drawPylon(iso, pal)

    // house
    poly(iso, listOf(v(-0.4, 3.5, 8.0), v(10.4, 3.5, 8.0), v(10.4, -0.6, 4.5), v(-0.4, -0.6, 4.5)), pal.roofBack)
    poly(iso, listOf(v(0.0, 7.0, 0.0), v(10.0, 7.0, 0.0), v(10.0, 7.0, 5.0), v(0.0, 7.0, 5.0)), pal.wallLeft)
    poly(iso, listOf(v(10.0, 0.0, 0.0), v(10.0, 7.0, 0.0), v(10.0, 7.0, 5.0), v(10.0, 3.5, 8.0), v(10.0, 0.0, 5.0)), pal.wallRight)
    poly(iso, listOf(v(7.4, 7.01, 0.0), v(8.6, 7.01, 0.0), v(8.6, 7.01, 2.3), v(7.4, 7.01, 2.3)), darken(pal.wallLeft, 0.25f))
    poly(iso, listOf(v(-0.4, 3.5, 8.0), v(10.4, 3.5, 8.0), v(10.4, 7.6, 4.5), v(-0.4, 7.6, 4.5)), pal.roof)

    drawPanels(iso, pal)

    // junction box where the solar cable starts
    val jb = onRoof(6.1, 0.9, 0.0)
    drawBox(iso, jb.x - 0.3, jb.x + 0.3, jb.y - 0.1, jb.y + 0.15, jb.z - 0.05, jb.z + 0.22, pal.box, pal.boxSide, boxTop)

    // window frames and sills (glass is drawn live)
    Windows.forEach { (y0, y1) ->
        poly(iso, listOf(v(10.01, y0 - 0.12, 1.48), v(10.01, y1 + 0.12, 1.48), v(10.01, y1 + 0.12, 3.72), v(10.01, y0 - 0.12, 3.72)), pal.frame)
        drawBox(iso, 10.0, 10.22, y0 - 0.2, y1 + 0.2, 1.36, 1.48, pal.box, pal.boxSide, boxTop)
    }

    // meter and breaker board where the home cable ends
    drawBox(iso, 10.0, 10.3, 5.7, 6.5, 1.9, 3.1, pal.box, pal.boxSide, boxTop)
    poly(iso, listOf(v(10.31, 5.85, 2.55), v(10.31, 6.35, 2.55), v(10.31, 6.35, 2.9), v(10.31, 5.85, 2.9)), ink)

    // inverter
    drawBox(iso, 5.5, 6.7, 7.0, 7.35, 2.0, 3.3, pal.box, pal.boxSide, boxTop)
    poly(iso, listOf(v(5.75, 7.36, 2.6), v(6.45, 7.36, 2.6), v(6.45, 7.36, 3.05), v(5.75, 7.36, 3.05)), ink)
}

/** Point on the front roof plane: x along the ridge, v from ridge (0) to eave (1), lifted off the roof. */
fun onRoof(x: Double, v: Double, lift: Double) = V3(x, 3.5 + 4.1 * v, 8.0 - 3.5 * v + lift)

private fun roofQuad(x0: Double, x1: Double, v0: Double, v1: Double, lift: Double) =
    listOf(onRoof(x0, v0, lift), onRoof(x1, v0, lift), onRoof(x1, v1, lift), onRoof(x0, v1, lift))

private fun DrawScope.drawPanels(iso: Iso, pal: ScenePalette) {
    val hair = 0.5.dp.toPx()
    for (row in 0 until 2) for (col in 0 until 4) {
        val x0 = 0.55 + col * 2.3
        val x1 = x0 + 2.18
        val v0 = 0.1 + row * 0.39
        val v1 = v0 + 0.37
        poly(iso, roofQuad(x0 + 0.08, x1 + 0.08, v0 + 0.02, v1 + 0.03, 0.0), Color.Black.copy(alpha = 0.28f))
        poly(iso, roofQuad(x0, x1, v0, v1, 0.12), pal.frame)
        val ix0 = x0 + 0.07
        val ix1 = x1 - 0.07
        val iv0 = v0 + 0.025
        val iv1 = v1 - 0.025
        val inner = roofQuad(ix0, ix1, iv0, iv1, 0.13)
        val a = iso.p(inner[0])
        val b = iso.p(inner[2])
        poly(iso, inner, Brush.linearGradient(listOf(pal.panelB, pal.panelA), start = a, end = b))
        val cell = pal.panelLine.copy(alpha = 0.35f)
        for (i in 1 until 6) {
            val x = ix0 + (ix1 - ix0) * i / 6
            drawLine(cell, iso.p(onRoof(x, iv0, 0.13)), iso.p(onRoof(x, iv1, 0.13)), strokeWidth = hair)
        }
        for (i in 1 until 4) {
            val vv = iv0 + (iv1 - iv0) * i / 4
            drawLine(cell, iso.p(onRoof(ix0, vv, 0.13)), iso.p(onRoof(ix1, vv, 0.13)), strokeWidth = hair)
        }
        poly(
            iso, inner,
            Brush.linearGradient(
                0.15f to Color.White.copy(alpha = 0f), 0.3f to Color.White.copy(alpha = 0.16f), 0.42f to Color.White.copy(alpha = 0f),
                start = iso.p(onRoof(ix0, iv0, 0.13)), end = iso.p(onRoof(ix1, iv1, 0.13)),
            ),
        )
    }
}

/** Tapered lattice tower with two crossarms, insulators, footings and sagging lines. */
private fun DrawScope.drawPylon(iso: Iso, pal: ScenePalette) {
    val px = -2.5
    val py = 10.5
    fun half(z: Double) = if (z <= 5.0) 1.0 - 0.65 * (z / 5.0) else 0.35 - 0.1 * ((z - 5.0) / 3.0)
    fun corner(sx: Int, sy: Int, z: Double) = v(px + sx * half(z), py + sy * half(z), z)
    val corners = listOf(-1 to -1, 1 to -1, 1 to 1, -1 to 1)
    val arms = listOf(6.2 to 1.9, 7.3 to 1.4)

    // power lines first so the tower draws over them
    val lineColor = pal.pylon.copy(alpha = 0.55f)
    arms.forEach { (z, w) ->
        listOf(-1, 1).forEach { sd ->
            val a = iso.p(px + sd * w, py, z - 0.45)
            val far = iso.p(px + sd * w - 16.0, py - 3.0, z + 1.2)
            val mid = Offset((a.x + far.x) / 2, (a.y + far.y) / 2 + iso.scale * 1.4f)
            drawPath(Path().apply { moveTo(a.x, a.y); quadraticTo(mid.x, mid.y, far.x, far.y) }, lineColor, style = Stroke(0.8.dp.toPx()))
        }
    }
    corners.forEach { (sx, sy) ->
        drawBox(
            iso, px + sx - 0.18, px + sx + 0.18, py + sy - 0.18, py + sy + 0.18, 0.0, 0.25,
            pal.footing, darken(pal.footing, 0.2f), lighten(pal.footing, 0.15f),
        )
    }
    val steel = pal.pylon.copy(alpha = 0.95f)
    val leg = 1.3.dp.toPx()
    corners.forEach { (sx, sy) ->
        var z = 0.0
        while (z < 8.0) {
            line(iso, corner(sx, sy, z), corner(sx, sy, z + 0.5), steel, leg)
            z += 0.5
        }
    }
    val brace = 0.7.dp.toPx()
    val levels = listOf(0.25, 1.4, 2.6, 3.8, 5.0, 6.2, 7.3, 8.0)
    for (i in 0 until levels.size - 1) {
        val z0 = levels[i]
        val z1 = levels[i + 1]
        line(iso, corner(-1, 1, z0), corner(1, 1, z1), steel, brace)
        line(iso, corner(1, 1, z0), corner(-1, 1, z1), steel, brace)
        line(iso, corner(1, -1, z0), corner(1, 1, z1), steel, brace)
        line(iso, corner(1, 1, z0), corner(1, -1, z1), steel, brace)
        line(iso, corner(-1, 1, z1), corner(1, 1, z1), steel, brace)
        line(iso, corner(1, -1, z1), corner(1, 1, z1), steel, brace)
    }
    val peak = v(px, py, 8.6)
    corners.forEach { (sx, sy) -> line(iso, corner(sx, sy, 8.0), peak, steel, brace) }
    val arm = 1.1.dp.toPx()
    arms.forEach { (z, w) ->
        listOf(-1, 1).forEach { sd ->
            val tip = v(px + sd * w, py, z)
            val h = half(z)
            line(iso, v(px + sd * h, py + h, z), tip, steel, arm)
            line(iso, v(px + sd * h, py - h, z), tip, steel, arm)
            line(iso, v(px + sd * h, py + h, z + 0.45), tip, steel, arm)
            line(iso, v(px + sd * h, py - h, z + 0.45), tip, steel, arm)
            line(iso, tip, v(tip.x, tip.y, z - 0.45), pal.frame.copy(alpha = 0.95f), 1.8.dp.toPx())
        }
    }
}
