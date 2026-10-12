package com.uzairbukhari.photon.ui.flow

import com.uzairbukhari.photon.data.SolarLatest
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** The four nodes of the energy flow scene. */
enum class FlowNode(val label: String) { Solar("Solar"), Grid("Grid"), Battery("Battery"), Home("Home") }

/** One reading, ready to draw. Battery power is signed: positive charging, negative discharging. */
data class EnergySnapshot(
    val solarW: Float,
    val homeW: Float,
    val gridW: Float?,
    val batteryW: Float,
    val soc: Float?,
    val fresh: Boolean,
)

/** Watts on each route between the nodes. Grid is import only. */
data class Flows(
    val solarToHome: Float,
    val solarToBattery: Float,
    val batteryToHome: Float,
    val gridToHome: Float,
    val gridToBattery: Float,
) {
    val solarUsed get() = solarToHome + solarToBattery
    val grid get() = gridToHome + gridToBattery
}

/** Solar serves the home first, then charges the battery; the battery covers what is left; the grid fills the rest. */
fun allocateFlows(solar: Float, home: Float, batteryW: Float): Flows {
    val solarW = max(0f, solar)
    val homeW = max(0f, home)
    val charge = max(0f, batteryW)
    val discharge = max(0f, -batteryW)
    val solarHome = min(solarW, homeW)
    val solarBattery = min(solarW - solarHome, charge)
    val batteryHome = min(discharge, homeW - solarHome)
    val gridHome = max(0f, homeW - solarHome - batteryHome)
    val gridBattery = max(0f, charge - solarBattery)
    return Flows(solarHome, solarBattery, batteryHome, gridHome, gridBattery)
}

fun energySnapshot(latest: SolarLatest, fresh: Boolean): EnergySnapshot = EnergySnapshot(
    solarW = (latest.value("solar_power") ?: 0.0).toFloat(),
    homeW = (latest.value("home_power") ?: 0.0).toFloat(),
    gridW = latest.value("grid_power")?.toFloat(),
    batteryW = (latest.batteryWatts() ?: 0.0).toFloat(),
    soc = latest.value("battery_soc")?.toFloat(),
    fresh = fresh,
)

/** Particle speed in dp per second: 50 W drifts, 4 kW streams. */
fun particleSpeedDp(watts: Float): Float = 28f + 60f * ln(1f + watts / 100f)

/** How many particles ride a route of [lengthDp]: grows with the square root of watts. */
fun particleCount(watts: Float, lengthDp: Float, max: Int): Float =
    min(max.toFloat(), (1f + sqrt(watts / 150f)) * (lengthDp / 160f))

fun particleRadiusDp(watts: Float): Float = 2.2f + 1.8f * ln(1f + watts / 500f)
