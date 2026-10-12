package com.uzairbukhari.photon.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/** A labelled button that opens a menu of (key, label) choices. */
@Composable
fun Picker(
    label: String,
    options: List<Pair<String, String>>,
    selected: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { open = true }, enabled = enabled && options.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selected }?.second ?: "Choose…", maxLines = 1)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (key, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onSelect(key) }) }
        }
    }
}

/** Decimal text field that reports null while the text is not a valid number. */
@Composable
fun NumberField(label: String, value: Double?, onChange: (Double?) -> Unit, modifier: Modifier = Modifier, integer: Boolean = false) {
    var text by remember(value == null) { mutableStateOf(value?.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }.orEmpty()) }
    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it
            onChange(if (integer) it.toLongOrNull()?.toDouble() else it.toDoubleOrNull())
        },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (integer) KeyboardType.Number else KeyboardType.Decimal),
        modifier = modifier,
    )
}

@Composable
fun SwitchRow(label: String, note: String?, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(label, color = MaterialTheme.colorScheme.onSurface)
            if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
