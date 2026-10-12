package com.uzairbukhari.photon

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.uzairbukhari.photon.ui.AppLock
import com.uzairbukhari.photon.ui.LockScreen
import com.uzairbukhari.photon.ui.PhotonRoot
import com.uzairbukhari.photon.ui.PhotonTheme

class MainActivity : FragmentActivity() {
    private var locked by mutableStateOf(true)
    private var leftAt = 0L

    private val graph get() = (application as PhotonApp).graph

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val theme by graph.prefs.theme.collectAsStateWithLifecycle()
            val lockOn by graph.prefs.biometric.collectAsStateWithLifecycle()
            PhotonTheme(theme) {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                    if (lockOn && locked) LockScreen(onUnlock = ::unlock) else PhotonRoot(graph)
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val away = if (leftAt == 0L) Long.MAX_VALUE else SystemClock.elapsedRealtime() - leftAt
        if (away >= LOCK_AFTER_MS) locked = true
        if (locked && graph.prefs.biometric.value) unlock()
    }

    override fun onStop() {
        leftAt = SystemClock.elapsedRealtime()
        super.onStop()
    }

    private fun unlock() {
        if (!AppLock.available(this)) { locked = false; return }
        AppLock.prompt(this) { locked = false }
    }

    private companion object {
        const val LOCK_AFTER_MS = 60_000L
    }
}
