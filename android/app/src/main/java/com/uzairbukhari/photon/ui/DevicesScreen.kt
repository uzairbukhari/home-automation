package com.uzairbukhari.photon.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.asBoolean
import kotlinx.coroutines.delay

private const val FAVOURITES = "★ Favourites"
private const val ALL = "All"

/** Applies the search box and chip filter the same way the website does. */
fun visibleDevices(devices: List<Device>, favorites: Set<String>, query: String, filter: String): List<Device> =
    devices.filter { device ->
        val matchesFilter = when (filter) {
            ALL -> true
            FAVOURITES -> device.id in favorites
            else -> device.room == filter
        }
        val text = query.trim()
        matchesFilter && (text.isEmpty() || device.title.contains(text, true) || device.room.contains(text, true) || device.productName.contains(text, true))
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicesScreen(model: DevicesViewModel, tileDevice: String?, onTile: (String) -> Unit, onMessage: (String) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(ALL) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.load()
                delay(120_000)
            }
        }
    }
    LaunchedEffect(state.message) {
        state.message?.let {
            onMessage(it)
            model.dismissMessage()
        }
    }

    val shown = visibleDevices(state.devices, state.favorites, query, filter)
    val chips = listOf(ALL, FAVOURITES) + state.devices.map { it.room }.distinct().sorted()

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { model.load(pull = true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Devices", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                        val online = state.devices.count { it.online }
                        Text(
                            if (state.offline) "Offline · showing saved devices" else "$online of ${state.devices.size} online",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = model::syncNow, enabled = !state.refreshing && !state.offline) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Check devices now", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search devices or rooms") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(chips) { chip -> FilterChip(selected = filter == chip, onClick = { filter = chip }, label = { Text(chip) }) }
                }
            }
            if (state.scenes.isNotEmpty() || state.groups.isNotEmpty()) {
                item {
                    Text("Quick actions", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(state.scenes) { scene -> AssistChip(onClick = { model.runScene(scene) }, label = { Text(scene.name) }, enabled = !state.offline) }
                        items(state.groups) { group -> AssistChip(onClick = { model.runGroup(group) }, label = { Text(group.name) }, enabled = !state.offline) }
                    }
                }
            }
            when {
                state.loading -> item { Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                state.error != null && state.devices.isEmpty() -> item { Text(state.error!!, color = MaterialTheme.colorScheme.error) }
                shown.isEmpty() -> item { Text("No devices match.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp)) }
                else -> shown.groupBy { it.room }.toSortedMap().forEach { (room, devices) ->
                    item(key = "room-$room") {
                        Text(room, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))
                    }
                    items(devices, key = { it.id }) { device ->
                        DeviceCard(
                            device = device,
                            favorite = device.id in state.favorites,
                            busy = state.pending.any { it.startsWith(device.id + ":") },
                            offline = state.offline,
                            onOpen = { selectedId = device.id },
                            onFavorite = { model.toggleFavorite(device) },
                            onSwitch = { code, on -> model.send(device, code, boolValue(on)) },
                        )
                    }
                }
            }
        }
    }

    state.devices.firstOrNull { it.id == selectedId }?.let { device ->
        DeviceSheet(
            device = device,
            state = state,
            onDismiss = { selectedId = null },
            onSend = { code, value -> model.send(device, code, value) },
            onFavorite = { model.toggleFavorite(device) },
            onRoom = { model.setRoom(device, it) },
            onRename = { model.rename(device, it) },
            isTile = tileDevice == device.id,
            onTile = { onTile(device.id); onMessage("Quick Settings tile now switches " + device.title) },
        )
    }
}

@Composable
private fun DeviceCard(
    device: Device,
    favorite: Boolean,
    busy: Boolean,
    offline: Boolean,
    onOpen: () -> Unit,
    onFavorite: () -> Unit,
    onSwitch: (String, Boolean) -> Unit,
) {
    val main = device.mainSwitch
    val isOn = main?.let { device.point(it.code)?.raw.asBoolean() }
    Surface(
        Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(10.dp).background(if (device.online && !device.stale) Hues.Battery else Hues.Warning, CircleShape),
            )
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(device.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    when {
                        !device.online -> "Offline"
                        device.stale -> "Status out of date"
                        busy -> "Sending…"
                        else -> device.primaryValue.ifBlank { device.productName }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onFavorite) {
                Icon(
                    if (favorite) Icons.Filled.Star else Icons.Filled.StarBorder,
                    contentDescription = if (favorite) "Remove from favourites" else "Add to favourites",
                    tint = if (favorite) Hues.Solar else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (main != null && isOn != null) {
                Switch(checked = isOn, onCheckedChange = { onSwitch(main.code, it) }, enabled = device.controllable && !busy && !offline)
            }
        }
    }
}
