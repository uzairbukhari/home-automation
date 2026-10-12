package com.uzairbukhari.photon

import com.uzairbukhari.photon.ui.flow.allocateFlows
import com.uzairbukhari.photon.ui.flow.particleCount
import com.uzairbukhari.photon.ui.flow.particleRadiusDp
import com.uzairbukhari.photon.ui.flow.particleSpeedDp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlowTest {
    @Test fun sunnyNoonChargesTheBatteryFromSolar() {
        val f = allocateFlows(solar = 4200f, home = 1300f, batteryW = 2900f)
        assertEquals(1300f, f.solarToHome, 0.01f)
        assertEquals(2900f, f.solarToBattery, 0.01f)
        assertEquals(0f, f.grid, 0.01f)
        assertEquals(0f, f.batteryToHome, 0.01f)
    }

    @Test fun eveningBatteryAndGridShareTheLoad() {
        val f = allocateFlows(solar = 250f, home = 2300f, batteryW = -1500f)
        assertEquals(250f, f.solarToHome, 0.01f)
        assertEquals(1500f, f.batteryToHome, 0.01f)
        assertEquals(550f, f.gridToHome, 0.01f)
        assertEquals(0f, f.solarToBattery, 0.01f)
    }

    @Test fun gridChargingAtNight() {
        val f = allocateFlows(solar = 0f, home = 600f, batteryW = 1400f)
        assertEquals(600f, f.gridToHome, 0.01f)
        assertEquals(1400f, f.gridToBattery, 0.01f)
        assertEquals(2000f, f.grid, 0.01f)
    }

    @Test fun routesNeverExceedWhatIsProduced() {
        val f = allocateFlows(solar = 800f, home = 3000f, batteryW = -5000f)
        assertTrue(f.solarUsed <= 800.01f)
        assertEquals(3000f, f.solarToHome + f.batteryToHome + f.gridToHome, 0.01f)
    }

    @Test fun particlesSpeedUpAndThickenWithPower() {
        assertTrue(particleSpeedDp(4000f) > particleSpeedDp(50f))
        assertTrue(particleCount(4000f, 300f, 14) > particleCount(50f, 300f, 14))
        assertEquals(14f, particleCount(100_000f, 300f, 14), 0.001f)
        assertTrue(particleRadiusDp(4000f) > particleRadiusDp(50f))
    }
}
