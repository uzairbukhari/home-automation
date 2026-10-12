package com.uzairbukhari.photon.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.uzairbukhari.photon.Graph

private enum class Tab(val label: String, val icon: ImageVector) {
    Overview("Overview", Icons.Filled.Home),
    Energy("Energy", Icons.Filled.WbSunny),
    Devices("Devices", Icons.Filled.Devices),
    Automations("Automations", Icons.Filled.Tune),
    Settings("Settings", Icons.Filled.Settings),
}

@Composable
fun PhotonRoot(graph: Graph) {
    val signedIn by graph.session.signedIn.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (signedIn) SignedInApp(graph) else {
            val model: LoginViewModel = viewModel(factory = LoginViewModel.factory(graph))
            LoginScreen(model)
        }
    }
}

@Composable
private fun SignedInApp(graph: Graph) {
    var tab by rememberSaveable { mutableStateOf(Tab.Overview) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = { Icon(entry.icon, contentDescription = null) },
                        label = { Text(entry.label, maxLines = 1) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.Overview -> {
                    val model: OverviewViewModel = viewModel(factory = OverviewViewModel.factory(graph))
                    OverviewScreen(model)
                }
                Tab.Settings -> SettingsScreen(graph)
                else -> ComingSoon(tab.label)
            }
        }
    }
}

@Composable
private fun ComingSoon(name: String) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(160.dp))
        Text(name, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(8.dp))
        Text("This screen arrives in the next app update.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
