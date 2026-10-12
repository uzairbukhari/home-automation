package com.uzairbukhari.photon.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.uzairbukhari.photon.BuildConfig
import com.uzairbukhari.photon.Graph

@Composable
fun SettingsScreen(graph: Graph) {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(24.dp))
        Text("Server", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(graph.session.serverUrl.orEmpty().removePrefix("https://"), color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(16.dp))
        Text("App version", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(BuildConfig.VERSION_NAME, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(32.dp))
        OutlinedButton(
            onClick = {
                graph.repository.clearCache(listOf("/api/solar/latest?summary=1", "/api/connection-status", "/api/settings"))
                graph.session.signOut()
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign out") }
    }
}
