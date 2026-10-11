package io.dehub.mobile.baselineprofile

import android.content.Intent
import android.net.Uri
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupProfileGenerator {
    @get:Rule val profile = BaselineProfileRule()

    @Test fun startup() = profile.collect(
        packageName = "io.dehub.mobile", includeInStartupProfile = true,
    ) {
        pressHome()
        startActivityAndWait(Intent(Intent.ACTION_VIEW, Uri.parse("dehub://app")))
        assertTrue("Home must be usable before recording startup", device.wait(Until.hasObject(By.desc("Home")), 30_000))
    }

    @Test fun feedAndNavigation() = profile.collect(packageName = "io.dehub.mobile") {
        startActivityAndWait(Intent(Intent.ACTION_VIEW, Uri.parse("dehub://app")))
        assertTrue(device.wait(Until.hasObject(By.desc("Home")), 30_000))
        device.findObject(By.scrollable(true))?.scroll(Direction.DOWN, 0.8f)
        device.waitForIdle()
        clickNavigation(device, "Explore")
        clickNavigation(device, "Home")
    }

    private fun clickNavigation(device: UiDevice, description: String) {
        repeat(3) { attempt ->
            val button = device.wait(Until.findObject(By.desc(description)), 30_000)
            assertTrue("$description navigation must be available", button != null)
            try {
                button!!.click()
                device.waitForIdle()
                return
            } catch (error: StaleObjectException) {
                if (attempt == 2) throw error
                device.waitForIdle()
            }
        }
    }
}
