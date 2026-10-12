package com.uzairbukhari.photon.ui.flow

import androidx.compose.ui.graphics.Color

/** Colours of the isometric scene, one set per theme. */
class ScenePalette(
    val light: Boolean,
    val skyDayTop: Color,
    val skyDayBottom: Color,
    val skyNightTop: Color,
    val skyNightBottom: Color,
    val wallLeft: Color,
    val wallRight: Color,
    val roof: Color,
    val roofBack: Color,
    val panelA: Color,
    val panelB: Color,
    val panelLine: Color,
    val ground: Color,
    val conduit: Color,
    val pylon: Color,
    val windowOff: Color,
    val windowOn: Color,
    val box: Color,
    val boxSide: Color,
    val frame: Color,
    val footing: Color,
)

private val Dark = ScenePalette(
    light = false,
    skyDayTop = Color(0xFF1D4F7A), skyDayBottom = Color(0xFF3D7FA8),
    skyNightTop = Color(0xFF050A16), skyNightBottom = Color(0xFF0E1A33),
    wallLeft = Color(0xFF1B2B45), wallRight = Color(0xFF14223A),
    roof = Color(0xFF26354F), roofBack = Color(0xFF1A2740),
    panelA = Color(0xFF0B1730), panelB = Color(0xFF1B3561), panelLine = Color(0xFF4A6AA0),
    ground = Color(0xFF0C1528), conduit = Color(0xFF2B3B58), pylon = Color(0xFF6B7F9E),
    windowOff = Color(0xFF22324D), windowOn = Color(0xFFFFD27A),
    box = Color(0xFFC9D4E4), boxSide = Color(0xFF9AA9BF), frame = Color(0xFF8EA2BF), footing = Color(0xFF3A4A66),
)

private val Light = ScenePalette(
    light = true,
    skyDayTop = Color(0xFFBFE3F2), skyDayBottom = Color(0xFFEAF6FB),
    skyNightTop = Color(0xFF2A3A5C), skyNightBottom = Color(0xFF56688C),
    wallLeft = Color(0xFFCFE0E6), wallRight = Color(0xFFB6CDD6),
    roof = Color(0xFF5D6F86), roofBack = Color(0xFF4A5A70),
    panelA = Color(0xFF1D2A40), panelB = Color(0xFF34486A), panelLine = Color(0xFF7D93B5),
    ground = Color(0xFFE2EBF2), conduit = Color(0xFF8AA0B4), pylon = Color(0xFF8796AB),
    windowOff = Color(0xFF9FB4C4), windowOn = Color(0xFFFFD36B),
    box = Color(0xFFF4F7FB), boxSide = Color(0xFFCDD7E3), frame = Color(0xFFE9EEF5), footing = Color(0xFFB9C5D3),
)

fun scenePalette(light: Boolean): ScenePalette = if (light) Light else Dark
