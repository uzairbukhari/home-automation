package com.uzairbukhari.photon.data

import kotlinx.serialization.Serializable

@Serializable
data class SolarPoint(
    val time: String = "",
    val sourceTimestamp: String = "",
    val solar: Double? = null,
    val home: Double? = null,
    val grid: Double? = null,
    val battery: Double? = null,
)

/** GET /api/solar/history */
@Serializable
data class HistoryResponse(
    val series: List<SolarPoint> = emptyList(),
    val from: String = "",
    val to: String = "",
    val granularity: String = "",
    val sampleCount: Int = 0,
    val note: String? = null,
)

@Serializable
data class Bucket(
    val date: String,
    val solar: Double? = null,
    val grid: Double? = null,
    val home: Double? = null,
    val partial: Boolean = false,
)

@Serializable
data class Buckets(
    val daily: List<Bucket> = emptyList(),
    val monthly: List<Bucket> = emptyList(),
    val yearly: List<Bucket> = emptyList(),
)

@Serializable
data class Production(
    val today: Double? = null,
    val month: Double? = null,
    val year: Double? = null,
    val lifetime: Double? = null,
)

@Serializable
data class PeriodTotals(
    val solarKwh: Double? = null,
    val homeKwh: Double? = null,
    val gridKwh: Double? = null,
    val batteryChargeKwh: Double? = null,
    val batteryDischargeKwh: Double? = null,
    val peakSolarW: Double? = null,
    val peakHomeW: Double? = null,
    val partial: Boolean = false,
)

@Serializable
data class Savings(
    val total: Double? = null,
    val energy: Double? = null,
    val gst: Double? = null,
    val duty: Double? = null,
    val income: Double? = null,
    val surcharge: Double? = null,
    val adjustments: Double? = null,
    val provisional: Boolean = false,
    val from: String = "",
    val to: String = "",
    val assumptions: List<String> = emptyList(),
)

/** GET /api/solar/reports */
@Serializable
data class ReportsResponse(
    val production: Production = Production(),
    val today: PeriodTotals = PeriodTotals(),
    val month: PeriodTotals = PeriodTotals(),
    val year: PeriodTotals = PeriodTotals(),
    val buckets: Buckets = Buckets(),
    val selectedYear: String = "",
    val availableYears: List<String> = emptyList(),
    val savings: Savings? = null,
    val previousCycles: List<Savings> = emptyList(),
    val updatedAt: String? = null,
    val warnings: List<String> = emptyList(),
    val gridMeter: String? = null,
)

@Serializable
data class EnergyGroup(
    val id: String,
    val name: String = "",
    val energyKwh: Double? = null,
    val estimatedCost: Double? = null,
    val peakW: Double? = null,
    val partial: Boolean = false,
)

@Serializable
data class Household(
    val homeKwh: Double? = null,
    val gridKwh: Double? = null,
    val solarKwh: Double? = null,
    val monitoredKwh: Double? = null,
    val unmonitoredKwh: Double? = null,
    val partial: Boolean = false,
    val warning: String? = null,
)

/** GET /api/reports (appliance energy and cost) */
@Serializable
data class AppliancesReport(
    val from: String = "",
    val to: String = "",
    val days: Int = 0,
    val devices: List<EnergyGroup> = emptyList(),
    val rooms: List<EnergyGroup> = emptyList(),
    val household: Household = Household(),
    val assumptions: List<String> = emptyList(),
)

@Serializable
data class BatteryHealthEstimate(
    val pct: Double = 0.0,
    val estimatedCapacityKwh: Double = 0.0,
    val samples: Int = 0,
)

@Serializable
data class BatteryDay(
    val date: String = "",
    val chargedKwh: Double? = null,
    val dischargedKwh: Double? = null,
    val cycles: Double? = null,
    val socMin: Double? = null,
    val socMax: Double? = null,
)

/** GET /api/solar/battery */
@Serializable
data class BatteryStats(
    val capacityKwh: Double? = null,
    val warrantyCycles: Int = 3000,
    val trackedDays: Int = 0,
    val since: String? = null,
    val chargedKwh: Double? = null,
    val dischargedKwh: Double? = null,
    val cycles: Double? = null,
    val cyclesLast30: Double? = null,
    val cyclesPerDay: Double? = null,
    val warrantyUsedPct: Double? = null,
    val cyclesRemaining: Double? = null,
    val yearsRemaining: Double? = null,
    val avgDepthPct: Double? = null,
    val deepestPct: Double? = null,
    val throughputKwh: Double? = null,
    val health: BatteryHealthEstimate? = null,
    val healthDays: Int = 0,
    val daily: List<BatteryDay> = emptyList(),
)
