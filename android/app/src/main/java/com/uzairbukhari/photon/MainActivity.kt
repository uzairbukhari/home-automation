package com.uzairbukhari.photon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.uzairbukhari.photon.ui.PhotonRoot
import com.uzairbukhari.photon.ui.PhotonTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val graph = (application as PhotonApp).graph
        setContent {
            val theme by graph.prefs.theme.collectAsStateWithLifecycle()
            PhotonTheme(theme) { PhotonRoot(graph) }
        }
    }
}
