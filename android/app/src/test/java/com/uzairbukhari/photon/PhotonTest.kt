package com.uzairbukhari.photon

import androidx.compose.ui.geometry.Offset
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.SolarLatest
import com.uzairbukhari.photon.data.normalizeServerUrl
import com.uzairbukhari.photon.ui.freshnessLabel
import com.uzairbukhari.photon.ui.isStale
import com.uzairbukhari.photon.ui.kilowatts
import com.uzairbukhari.photon.ui.parseInstant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotonTest {
    @Test fun serverAddressIsNormalised() {
        assertEquals("https://home.example.workers.dev", normalizeServerUrl(" home.example.workers.dev/ "))
        assertEquals("https://home.example.workers.dev", normalizeServerUrl("https://home.example.workers.dev/login?x=1"))
        assertNull(normalizeServerUrl(""))
        assertNull(normalizeServerUrl("http://home.example.workers.dev"))
        assertNull(normalizeServerUrl("not a url"))
    }

    @Test fun solarSnapshotParsesAndIgnoresExtraFields() {
        val json = """{"readings":[{"entityId":"x","metric":"battery_soc","value":87,"unit":"%","quality":"good"},
            {"metric":"solar_power","value":null}],"device":{"name":"Inverter","serial":"S1","mode":"Line mode"},
            "updatedAt":"2026-10-12T10:00:00.000Z","stale":false,"collection":{"status":"success"},"extra":1}"""
        val latest = AppJson.decodeFromString<SolarLatest>(json)
        assertEquals(87.0, latest.value("battery_soc")!!, 0.0)
        assertNull(latest.value("solar_power"))
        assertNull(latest.value("missing"))
        assertEquals("Line mode", latest.device.mode)
    }

    @Test fun freshnessMatchesTheWebsite() {
        val now = 10_000_000_000L
        assertEquals("Updated just now", freshnessLabel(now - 5_000, now))
        assertEquals("Updated 4 min ago", freshnessLabel(now - 4 * 60_000, now))
        assertEquals("Updated 2 hr ago", freshnessLabel(now - 2 * 3_600_000, now))
        assertEquals("No update yet", freshnessLabel(null, now))
        assertFalse(isStale(now - 10 * 60_000, now))
        assertTrue(isStale(now - 12 * 60_000, now))
        assertTrue(isStale(null, now))
        assertEquals(1_760_263_200_000L, parseInstant("2025-10-12T10:00:00Z"))
    }

    @Test fun kilowattsFormatsOrDashes() {
        assertEquals("1.25", kilowatts(1250.0))
        assertEquals("—", kilowatts(null))
    }

    @Test fun flowDotsTravelFromTheNodeToTheInverter() {
        val from = Offset(0f, 0f)
        val to = Offset(100f, 100f)
        assertEquals(from, com.uzairbukhari.photon.ui.pointOnCurve(from, to, 0f))
        assertEquals(to, com.uzairbukhari.photon.ui.pointOnCurve(from, to, 1f))
    }
}
