package com.uzairbukhari.photon.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object Hues {
    val Solar = Color(0xFFF8D35A)
    val Battery = Color(0xFF4ADE80)
    val Home = Color(0xFF58E1F7)
    val Grid = Color(0xFFC084FC)
    val Warning = Color(0xFFF59E0B)
}

private val Dark = darkColorScheme(
    primary = Color(0xFF58E1F7),
    onPrimary = Color(0xFF07101E),
    background = Color(0xFF09111F),
    onBackground = Color(0xFFE6EDF7),
    surface = Color(0xFF09111F),
    onSurface = Color(0xFFE6EDF7),
    surfaceVariant = Color(0xFF121E33),
    onSurfaceVariant = Color(0xFF9FB0C8),
    surfaceContainer = Color(0xFF0F1A2D),
    outline = Color(0xFF2A3A55),
    error = Color(0xFFFF8A80),
)

private val Light = lightColorScheme(
    primary = Color(0xFF0A7C93),
    onPrimary = Color.White,
    background = Color(0xFFF4F8FC),
    onBackground = Color(0xFF0B1626),
    surface = Color(0xFFF4F8FC),
    onSurface = Color(0xFF0B1626),
    surfaceVariant = Color(0xFFE3ECF6),
    onSurfaceVariant = Color(0xFF475A75),
    surfaceContainer = Color(0xFFFFFFFF),
    outline = Color(0xFFB8C6D9),
    error = Color(0xFFB3261E),
)

@Composable
fun PhotonTheme(mode: String = "system", content: @Composable () -> Unit) {
    val dark = when (mode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
