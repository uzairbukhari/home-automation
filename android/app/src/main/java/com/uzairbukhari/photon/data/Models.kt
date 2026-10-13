package com.uzairbukhari.photon.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val AppJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
}

@Serializable
data class Reading(
    val metric: String,
    val value: Double? = null,
    val unit: String = "",
    val sourceTimestamp: String? = null,
    val quality: String = "good",
)

@Serializable
data class InverterDevice(
    val name: String = "",
    val serial: String = "",
    val collector: String = "",
    val mode: String? = null,
)

/** Today's totals from GET /api/solar/latest?summary=1. */
@Serializable
data class DayToday(
    val solarKwh: Double? = null,
    val homeKwh: Double? = null,
    val gridKwh: Double? = null,
    val batteryChargeKwh: Double? = null,
    val batteryDischargeKwh: Double? = null,
    val peakSolarW: Double? = null,
    val peakSolarAt: String? = null,
)

/** Response of GET /api/solar/latest (the series is not requested by the app). */
@Serializable
data class SolarLatest(
    val readings: List<Reading> = emptyList(),
    val device: InverterDevice = InverterDevice(),
    val updatedAt: String? = null,
    val stale: Boolean = false,
    val today: DayToday? = null,
) {
    fun value(metric: String): Double? = readings.firstOrNull { it.metric == metric }?.value

    /** Signed battery power in watts: positive while charging, negative while discharging; null without voltage. */
    fun batteryWatts(): Double? = batteryPower(value("battery_voltage"), value("battery_charge_current"), value("battery_discharge_current"))
}

fun batteryPower(voltage: Double?, chargeA: Double?, dischargeA: Double?): Double? {
    if (voltage == null) return null
    return voltage * ((chargeA ?: 0.0) - (dischargeA ?: 0.0))
}

@Serializable
data class ProviderStatus(
    val provider: String,
    val status: String,
    val lastSuccessAt: String? = null,
    val blocker: String? = null,
)

@Serializable
data class ProvidersResponse(val providers: List<ProviderStatus> = emptyList())

/** The parts of GET /api/settings the Overview needs. */
@Serializable
data class AppSettings(
    val threshold: Double = 39.0,
    val capacity: Double = 5.2,
)

@Serializable
data class LoginResponse(val token: String)

@Serializable
data class ErrorResponse(val error: String? = null)

/** For request bodies: defaults such as enabled=false must be sent, nulls must not. */
val RequestJson = Json {
    encodeDefaults = true
    explicitNulls = false
}
