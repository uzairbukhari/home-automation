package com.uzairbukhari.photon.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.uzairbukhari.photon.data.Capability
import com.uzairbukhari.photon.data.Device
import com.uzairbukhari.photon.data.asBoolean
import com.uzairbukhari.photon.data.asNumber
import com.uzairbukhari.photon.data.asString
import com.uzairbukhari.photon.data.friendlyOption
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.pow
import kotlin.math.roundToLong

/** Slider positions in display units: the stored integer divided by 10^scale. */
fun displayValue(raw: Double, scale: Int): Double = raw / 10.0.pow(scale)

/** Whole numbers are sent as integers so the server's step check sees clean values. */
fun numberElement(value: Double): JsonElement =
    if (value == value.roundToLong().toDouble()) JsonPrimitive(value.roundToLong()) else JsonPrimitive(value)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceSheet(
    device: Device,
    state: DevicesState,
    onDismiss: () -> Unit,
    onSend: (String, JsonElement) -> Unit,
    onFavorite: () -> Unit,
    onRoom: (String) -> Unit,
    onRename: (String) -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    var renaming by remember { mutableStateOf(false) }
    var roomMenu by remember { mutableStateOf(false) }
    var newRoom by remember { mutableStateOf(false) }
    val favorite = device.id in state.favorites

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(device.title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        if (device.online) "${device.productName.ifBlank { device.category }} · ${device.room}" else "Offline · ${device.room}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onFavorite) {
                    Icon(if (favorite) Icons.Filled.Star else Icons.Filled.StarBorder, contentDescription = "Favourite", tint = if (favorite) Hues.Solar else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.surface) {
                listOf("Controls", "Readings", "Details").forEachIndexed { index, name ->
                    Tab(selected = tab == index, onClick = { tab = index }, text = { Text(name) })
                }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                when (tab) {
                    0 -> {
                        if (!device.controllable) Text("This device is offline or its status is out of date, so controls are paused.", color = Hues.Warning)
                        val writable = device.capabilities.filter { it.writable }
                        if (writable.isEmpty()) Text("No controls are available for this device.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        writable.forEach { cap ->
                            val busy = "${device.id}:${cap.code}" in state.pending
                            ControlRow(device, cap, enabled = device.controllable && !busy && !state.offline, busy = busy, onSend = onSend)
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                        }
                    }
                    1 -> {
                        val readings = device.datapoints.filter { it.available }
                        if (readings.isEmpty()) Text("No readings yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        readings.forEach { point ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(device.channelLabels[point.code] ?: com.uzairbukhari.photon.data.friendlyLabel(point.code, point.name), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(listOf(point.formatted, point.unit).filter { it.isNotBlank() }.joinToString(" "), color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                    else -> {
                        Detail("Room", device.room)
                        Detail("Product", device.productName.ifBlank { device.category })
                        Detail("Last update", device.updatedAt?.let { freshnessLabel(parseInstant(it)).removePrefix("Updated ") } ?: "—")
                        Detail("Device ID", device.id)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { renaming = true }, enabled = !state.offline) { Text("Rename") }
                            Column {
                                OutlinedButton(onClick = { roomMenu = true }, enabled = !state.offline) { Text("Move to room") }
                                DropdownMenu(expanded = roomMenu, onDismissRequest = { roomMenu = false }) {
                                    state.rooms.filter { it != device.room }.forEach { room ->
                                        DropdownMenuItem(text = { Text(room) }, onClick = { roomMenu = false; onRoom(room) })
                                    }
                                    DropdownMenuItem(text = { Text("New room…") }, onClick = { roomMenu = false; newRoom = true })
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (renaming) TextDialog("Rename device", device.title, onDismiss = { renaming = false }) { onRename(it); renaming = false }
    if (newRoom) TextDialog("New room", "", onDismiss = { newRoom = false }) { onRoom(it); newRoom = false }
}

@Composable
private fun Detail(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun TextDialog(title: String, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(text, { text = it.take(60) }, singleLine = true) },
        confirmButton = { TextButton(onClick = { onSave(text) }, enabled = text.isNotBlank() || title == "Rename device") { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ControlRow(device: Device, cap: Capability, enabled: Boolean, busy: Boolean, onSend: (String, JsonElement) -> Unit) {
    val point = device.point(cap.code)
    val name = device.label(cap)
    val note = when {
        busy -> "Sending command…"
        else -> point?.formatted?.takeIf { it.isNotBlank() }
    }
    when (cap.type) {
        "Boolean" -> {
            val on = point?.raw.asBoolean()
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(name, color = MaterialTheme.colorScheme.onSurface)
                    Text(note ?: "Awaiting device status", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = on == true, onCheckedChange = { onSend(cap.code, JsonPrimitive(it)) }, enabled = enabled && on != null)
            }
        }
        "Enum" -> {
            val current = point?.raw.asString()
            var open by remember { mutableStateOf(false) }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(name, color = MaterialTheme.colorScheme.onSurface)
                    Text(note ?: "Choose a setting", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column {
                    OutlinedButton(onClick = { open = true }, enabled = enabled) { Text(current?.let(::friendlyOption) ?: "Choose…") }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        cap.options.forEach { option ->
                            DropdownMenuItem(text = { Text(friendlyOption(option)) }, onClick = { open = false; onSend(cap.code, JsonPrimitive(option)) })
                        }
                    }
                }
            }
        }
        "Integer" -> {
            val min = (cap.min ?: 0.0).toFloat()
            val max = (cap.max ?: 100.0).toFloat().coerceAtLeast(min + 1f)
            val step = cap.step?.takeIf { it > 0 } ?: 1.0
            val current = point?.raw.asNumber()?.let { displayValue(it, cap.scale) }?.toFloat() ?: min
            var draft by remember(current) { mutableFloatStateOf(current.coerceIn(min, max)) }
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, color = MaterialTheme.colorScheme.onSurface)
                    Text("%.1f %s".format(draft, cap.unit).replace(".0 ", " "), color = MaterialTheme.colorScheme.primary)
                }
                Slider(
                    value = draft,
                    onValueChange = { draft = it },
                    valueRange = min..max,
                    steps = (((max - min) / step) - 1).toInt().coerceIn(0, 200),
                    enabled = enabled && cap.metadataVerified,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (cap.metadataVerified) "${min.toInt()}–${max.toInt()} ${cap.unit}" else "Range not verified by the device", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { onSend(cap.code, numberElement(draft.toDouble())) }, enabled = enabled && cap.metadataVerified) { Text("Apply") }
                }
            }
        }
        "String" -> {
            var text by remember(point?.raw) { mutableStateOf(point?.raw.asString().orEmpty()) }
            Column {
                OutlinedTextField(text, { text = it }, label = { Text(name) }, enabled = enabled, singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(onClick = { onSend(cap.code, JsonPrimitive(text)) }, enabled = enabled) { Text("Apply") }
            }
        }
        else -> Column {
            Text(name, color = MaterialTheme.colorScheme.onSurface)
            Text("Managed in the device app", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
