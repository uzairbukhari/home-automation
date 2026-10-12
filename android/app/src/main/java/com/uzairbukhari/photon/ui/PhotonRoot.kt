package com.uzairbukhari.photon.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import kotlinx.coroutines.launch
import androidx.compose.material3.Text
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import com.uzairbukhari.photon.data.VersionInfo
import com.uzairbukhari.photon.update.UpdateChecker
import com.uzairbukhari.photon.work.Notifications
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !Notifications.canPost(context)) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    var update by remember { mutableStateOf<VersionInfo?>(null) }
    LaunchedEffect(Unit) { update = UpdateChecker(graph.api) { graph.session.serverUrl }.newer() }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = {
                            if (tab != entry) haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.ContextClick)
                            tab = entry
                        },
                        icon = { Icon(entry.icon, contentDescription = null) },
                        label = { Text(entry.label, maxLines = 1) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
          update?.let { info ->
            Surface(color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Update ${info.versionName} is ready", Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer)
                    TextButton(onClick = { UpdateChecker(graph.api) { graph.session.serverUrl }.apkUrl(info)?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } }) { Text("Download") }
                }
            }
          }
          Box(Modifier.weight(1f).fillMaxWidth()) {
            when (tab) {
                Tab.Overview -> {
                    val model: OverviewViewModel = viewModel(factory = OverviewViewModel.factory(graph))
                    OverviewScreen(model)
                }
                Tab.Energy -> {
                    val model: EnergyViewModel = viewModel(factory = EnergyViewModel.factory(graph))
                    EnergyScreen(model)
                }
                Tab.Devices -> {
                    val model: DevicesViewModel = viewModel(factory = DevicesViewModel.factory(graph))
                    val tileDevice by graph.prefs.tileDevice.collectAsStateWithLifecycle()
                    DevicesScreen(model, tileDevice, onTile = { graph.prefs.setTileDevice(it) }) { message -> scope.launch { snackbar.showSnackbar(message) } }
                }
                Tab.Automations -> {
                    val model: AutomationsViewModel = viewModel(factory = AutomationsViewModel.factory(graph))
                    AutomationsScreen(model) { message -> scope.launch { snackbar.showSnackbar(message) } }
                }
                Tab.Settings -> {
                    val model: SettingsViewModel = viewModel(factory = SettingsViewModel.factory(graph))
                    SettingsScreen(graph, model) { message -> scope.launch { snackbar.showSnackbar(message) } }
                }
            }
          }
        }
    }
}
