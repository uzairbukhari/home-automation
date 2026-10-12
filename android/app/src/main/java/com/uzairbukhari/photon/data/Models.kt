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

/** Response of GET /api/solar/latest (the series is not requested by the app). */
@Serializable
data class SolarLatest(
    val readings: List<Reading> = emptyList(),
    val device: InverterDevice = InverterDevice(),
    val updatedAt: String? = null,
    val stale: Boolean = false,
) {
    fun value(metric: String): Double? = readings.firstOrNull { it.metric == metric }?.value
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
