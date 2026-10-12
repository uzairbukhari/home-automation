package com.uzairbukhari.photon.data

import kotlinx.serialization.Serializable

/** The editable numbers of GET/PUT /api/settings. Tariff details stay on the server untouched. */
@Serializable
data class BillingSettings(
    val unitRate: Double = 13.01,
    val referenceRate: Double = 10.54,
    val fixedCharges: Double = 300.0,
    val adjustments: Double = 0.0,
    val billingDay: Int = 1,
    val capacity: Double = 5.2,
    val threshold: Double = 39.0,
    val timeOfUse: Boolean = false,
    val peakRate: Double = 46.85,
    val offPeakRate: Double = 34.53,
    val peakStart: String = "17:00",
    val peakEnd: String = "22:00",
)

@Serializable
data class CredentialStatus(val configured: Boolean = false, val updatedAt: String? = null)

@Serializable
data class AlertRule(
    val id: String,
    val kind: String,
    val enabled: Boolean = false,
    val recovery: Boolean = true,
    val deviceId: String? = null,
    val code: String? = null,
    val operator: String? = null,
    val threshold: kotlinx.serialization.json.JsonElement? = null,
)

@Serializable
data class AlertHealth(
    @kotlinx.serialization.SerialName("evaluated_at") val evaluatedAt: String? = null,
    @kotlinx.serialization.SerialName("delivered_at") val deliveredAt: String? = null,
    val error: String? = null,
)

@Serializable
data class AlertPreferences(
    val rules: List<AlertRule> = emptyList(),
    val health: AlertHealth? = null,
)

@Serializable
data class StorageJob(val id: String, @kotlinx.serialization.SerialName("last_success") val lastSuccess: String? = null, val error: String? = null)

@Serializable
data class StorageRequest(val provider: String = "", val purpose: String = "", val requests: Int = 0, val failures: Int = 0)

@Serializable
data class StorageCount(val table: String, val records: Long = 0)

@Serializable
data class StorageHealth(
    val jobs: List<StorageJob> = emptyList(),
    val requests: List<StorageRequest> = emptyList(),
    val counts: List<StorageCount> = emptyList(),
    val databaseBytes: Long? = null,
    val schedulerHealthy: Boolean = false,
)
