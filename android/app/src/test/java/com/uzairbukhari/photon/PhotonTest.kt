package com.uzairbukhari.photon

import com.uzairbukhari.photon.data.AlertFeed
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.VersionInfo
import com.uzairbukhari.photon.update.UpdateChecker
import com.uzairbukhari.photon.data.asBoolean
import com.uzairbukhari.photon.data.SolarLatest
import com.uzairbukhari.photon.data.normalizeServerUrl
import com.uzairbukhari.photon.ui.freshnessLabel
import com.uzairbukhari.photon.ui.isStale
import com.uzairbukhari.photon.data.batteryPower
import com.uzairbukhari.photon.ui.kilowatts
import com.uzairbukhari.photon.ui.nextPollDelayMs
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

class EnergyTest {
    @Test fun axisMaximumsAreTidy() {
        assertEquals(1.0, com.uzairbukhari.photon.ui.niceMax(0.0), 0.0)
        assertEquals(5.0, com.uzairbukhari.photon.ui.niceMax(4.1), 0.0)
        assertEquals(2.5, com.uzairbukhari.photon.ui.niceMax(2.2), 0.0)
        assertEquals(100.0, com.uzairbukhari.photon.ui.niceMax(80.0), 0.0)
        assertEquals(10.0, com.uzairbukhari.photon.ui.niceMax(10.0), 0.0)
    }

    @Test fun reportsParseWithMissingSections() {
        val json = """{"production":{"today":12.3,"lifetime":4000},"buckets":{"daily":[{"date":"2026-10-12","solar":10.5,"grid":null}]},
            "selectedYear":"2026","availableYears":["2025","2026"],"savings":{"total":1500.4,"provisional":true,"from":"2026-10-01","to":"2026-10-12","cycles":[]}}"""
        val report = com.uzairbukhari.photon.data.AppJson.decodeFromString<com.uzairbukhari.photon.data.ReportsResponse>(json)
        assertEquals(12.3, report.production.today!!, 0.0)
        assertNull(report.production.month)
        assertNull(report.buckets.daily[0].grid)
        assertTrue(report.savings!!.provisional)
        assertEquals("Rs 1,500", com.uzairbukhari.photon.ui.rupees(report.savings!!.total))
        assertEquals("12.3 kWh", com.uzairbukhari.photon.ui.kwh(12.3))
        assertEquals("—", com.uzairbukhari.photon.ui.kwh(null))
    }
}

class AutomationTest {
    private fun name(id: String) = if (id == "d1") "Heater" else "Unknown"

    @Test fun ruleEncodesDefaultsAndOmitsNulls() {
        val rule = com.uzairbukhari.photon.ui.blankRule().copy(
            name = "Save battery",
            actions = listOf(com.uzairbukhari.photon.data.RuleAction("d1", "switch_1", kotlinx.serialization.json.JsonPrimitive(false))),
        )
        val json = com.uzairbukhari.photon.data.RequestJson.encodeToJsonElement(com.uzairbukhari.photon.data.AutomationRule.serializer(), rule).toString()
        assertTrue(json.contains("\"enabled\":false"))
        assertTrue(json.contains("\"cooldownMinutes\":30"))
        assertFalse(json.contains("null"))
        assertFalse(json.contains("recovery"))
    }

    @Test fun rulesAreDescribedInPlainWords() {
        val battery = com.uzairbukhari.photon.data.Condition(source = "solar", metric = "battery_soc", operator = "lte", value = kotlinx.serialization.json.JsonPrimitive(20))
        assertEquals("Battery level (%) is at most 20", com.uzairbukhari.photon.data.describeCondition(battery, ::name))
        val window = com.uzairbukhari.photon.data.Condition(source = "schedule", start = "09:00", end = "17:00", days = listOf(1, 2))
        assertEquals("Between 09:00 and 17:00 on Mon, Tue", com.uzairbukhari.photon.data.describeCondition(window, ::name))
        val action = com.uzairbukhari.photon.data.RuleAction("d1", "switch_1", kotlinx.serialization.json.JsonPrimitive(false))
        assertEquals("Set Heater · Power · channel 1 to off", com.uzairbukhari.photon.data.describeAction(action, ::name))
    }

    @Test fun incompleteRulesAreRejectedBeforeSaving() {
        val blank = com.uzairbukhari.photon.ui.blankRule()
        assertEquals("Give the rule a name.", com.uzairbukhari.photon.ui.ruleProblem(blank))
        assertEquals("Add at least one action.", com.uzairbukhari.photon.ui.ruleProblem(blank.copy(name = "x")))
        val complete = blank.copy(name = "x", actions = listOf(com.uzairbukhari.photon.data.RuleAction("d1", "switch_1", kotlinx.serialization.json.JsonPrimitive(true))))
        assertNull(com.uzairbukhari.photon.ui.ruleProblem(complete))
        assertEquals("Cooldown must be at least 10 minutes.", com.uzairbukhari.photon.ui.ruleProblem(complete.copy(cooldownMinutes = 5)))
    }

    @Test fun snapshotParsesServerRows() {
        val json = """{"rules":[{"rule":{"id":"r1","name":"A","enabled":true,"logic":"all","conditions":[],"actions":[],"durationMinutes":0,"cooldownMinutes":30},"state":{"active":true,"reason":"Conditions met"}}],
            "paused":false,"runs":[{"id":"x","rule_id":"r1","started_at":"2026-10-12T10:00:00Z","status":"confirmed","actions":[{"status":"confirmed"}]}]}"""
        val snap = com.uzairbukhari.photon.data.AppJson.decodeFromString<com.uzairbukhari.photon.data.AutomationSnapshot>(json)
        assertTrue(snap.rules[0].state!!.active)
        assertEquals("r1", snap.runs[0].ruleId)
    }
}

class UpdateAndAlertTest {
    @Test fun onlyHigherVersionCodesCountAsUpdates() {
        assertTrue(UpdateChecker.isNewer(101, 100))
        assertFalse(UpdateChecker.isNewer(100, 100))
        assertFalse(UpdateChecker.isNewer(99, 100))
    }

    @Test fun versionFileParses() {
        val info = AppJson.decodeFromString<VersionInfo>("""{"versionCode":120,"versionName":"2.0.120","apk":"/app/photon.apk","extra":1}""")
        assertEquals(120, info.versionCode)
        assertEquals("/app/photon.apk", info.apk)
    }

    @Test fun alertFeedParsesWithMissingFields() {
        val feed = AppJson.decodeFromString<AlertFeed>("""{"alerts":[{"id":7,"title":"Battery low","body":"Below 20%"}],"latest":7}""")
        assertEquals(1, feed.alerts.size)
        assertEquals("", feed.alerts[0].url)
        assertEquals(7L, feed.latest)
    }

    @Test fun batteryPowerIsSignedAndNeedsVoltage() {
        assertEquals(1200.0, batteryPower(48.0, 25.0, 0.0)!!, 0.001)
        assertEquals(-480.0, batteryPower(48.0, 0.0, 10.0)!!, 0.001)
        assertEquals(0.0, batteryPower(48.0, null, null)!!, 0.001)
        assertNull(batteryPower(null, 5.0, 0.0))
    }

    @Test fun pollWaitsForNextCollectionButNeverBelowAMinute() {
        val now = 1_000_000_000L
        assertEquals(60_000L, nextPollDelayMs(null, now))
        assertEquals(60_000L, nextPollDelayMs(now - 290_000, now)) // due in 30 s, clamped up
        assertEquals(200_000L, nextPollDelayMs(now - 120_000, now) )
        assertEquals(60_000L, nextPollDelayMs(now - 3_600_000, now)) // stale: keep checking each minute
    }
}
