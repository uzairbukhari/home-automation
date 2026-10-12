package com.uzairbukhari.photon

import androidx.compose.ui.geometry.Offset
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.asBoolean
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

class DeviceTest {
    private val json = """{"devices":[
      {"id":"a","name":"Lamp","room":"Lounge","online":true,"stale":false,"primaryValue":"On",
       "datapoints":[{"code":"switch_1","raw":true,"formatted":"On"},{"code":"bright_value","raw":500,"formatted":"50 %"}],
       "capabilities":[{"code":"switch_1","name":"Switch 1","type":"Boolean","writable":true},
                       {"code":"bright_value","name":"Brightness","type":"Integer","writable":true,"min":10,"max":100,"scale":1,"metadataVerified":true}]},
      {"id":"b","name":"Fan","alias":"Bedroom fan","room":"Bedroom","online":false,"stale":false}]}"""

    @Test fun devicesParseWithOptionalFields() {
        val devices = com.uzairbukhari.photon.data.AppJson.decodeFromString<com.uzairbukhari.photon.data.DevicesResponse>(json).devices
        assertEquals("Bedroom fan", devices[1].title)
        assertEquals("switch_1", devices[0].mainSwitch!!.code)
        assertEquals(true, devices[0].point("switch_1")!!.raw.asBoolean())
        assertTrue(devices[0].controllable)
        assertFalse(devices[1].controllable)
    }

    @Test fun searchAndFiltersMatchTheWebsite() {
        val devices = com.uzairbukhari.photon.data.AppJson.decodeFromString<com.uzairbukhari.photon.data.DevicesResponse>(json).devices
        assertEquals(1, com.uzairbukhari.photon.ui.visibleDevices(devices, emptySet(), "lamp", "All").size)
        assertEquals(1, com.uzairbukhari.photon.ui.visibleDevices(devices, emptySet(), "", "Bedroom").size)
        assertEquals(1, com.uzairbukhari.photon.ui.visibleDevices(devices, setOf("a"), "", "★ Favourites").size)
        assertEquals(2, com.uzairbukhari.photon.ui.visibleDevices(devices, emptySet(), " ", "All").size)
    }

    @Test fun labelsAndSliderValues() {
        assertEquals("Power", com.uzairbukhari.photon.data.friendlyLabel("switch"))
        assertEquals("Power · channel 2", com.uzairbukhari.photon.data.friendlyLabel("switch_2"))
        assertEquals("Some thing", com.uzairbukhari.photon.data.friendlyLabel("some_thing"))
        assertEquals("Follow power state", com.uzairbukhari.photon.data.friendlyOption("relay"))
        assertEquals(50.0, com.uzairbukhari.photon.ui.displayValue(500.0, 1), 0.0001)
        assertEquals("50", com.uzairbukhari.photon.ui.numberElement(50.0).toString())
        assertEquals("50.5", com.uzairbukhari.photon.ui.numberElement(50.5).toString())
    }
}
