package com.uzairbukhari.photon.ui

import java.time.Instant

private const val EXPECTED_INTERVAL_MS = 300_000L

/** "Updated 4 min ago", matching the website's wording. */
fun freshnessLabel(observedAtMillis: Long?, nowMillis: Long = System.currentTimeMillis()): String {
    if (observedAtMillis == null) return "No update yet"
    val age = nowMillis - observedAtMillis
    return when {
        age < 60_000 -> "Updated just now"
        age < 3_600_000 -> "Updated ${age / 60_000} min ago"
        age < 86_400_000 -> "Updated ${age / 3_600_000} hr ago"
        else -> "Updated ${age / 86_400_000} d ago"
    }
}

/** Readings older than two collection cycles plus a minute are treated as stale. */
fun isStale(observedAtMillis: Long?, nowMillis: Long = System.currentTimeMillis()): Boolean {
    if (observedAtMillis == null) return true
    val age = nowMillis - observedAtMillis
    return age < -5_000 || age > EXPECTED_INTERVAL_MS * 2 + 60_000
}

/** Next Overview reload: shortly after the next 5-minute collection is due, never faster than 60 s. */
fun nextPollDelayMs(observedAtMillis: Long?, nowMillis: Long = System.currentTimeMillis()): Long {
    if (observedAtMillis == null) return 60_000L
    val due = observedAtMillis + EXPECTED_INTERVAL_MS + 20_000L - nowMillis
    return due.coerceIn(60_000L, EXPECTED_INTERVAL_MS)
}

fun parseInstant(text: String?): Long? = text?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

fun kilowatts(watts: Double?): String = if (watts == null) "—" else "%.2f".format(watts / 1000)
