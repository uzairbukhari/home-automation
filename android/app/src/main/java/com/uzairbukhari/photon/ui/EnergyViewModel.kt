package com.uzairbukhari.photon.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.AppliancesReport
import com.uzairbukhari.photon.data.HistoryResponse
import com.uzairbukhari.photon.data.ReportsResponse
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.IOException

/** One loadable screen section: the data, whether it came from the saved copy, and any error. */
data class Section<T>(val data: T? = null, val loading: Boolean = false, val offline: Boolean = false, val error: String? = null)

val HISTORY_RANGES = listOf("24h" to "24 hours", "48h" to "48 hours", "7d" to "7 days", "30d" to "30 days", "week" to "Week", "month" to "This month")
val APPLIANCE_RANGES = listOf("today" to "Today", "week" to "7 days", "month" to "This month", "cycle" to "Billing cycle")

class EnergyViewModel(private val graph: Graph) : ViewModel() {
    private val _history = MutableStateFlow(Section<HistoryResponse>())
    private val _reports = MutableStateFlow(Section<ReportsResponse>())
    private val _appliances = MutableStateFlow(Section<AppliancesReport>())
    val history: StateFlow<Section<HistoryResponse>> = _history.asStateFlow()
    val reports: StateFlow<Section<ReportsResponse>> = _reports.asStateFlow()
    val appliances: StateFlow<Section<AppliancesReport>> = _appliances.asStateFlow()
    private val jobs = mutableMapOf<String, Job>()

    private fun <T> load(slot: String, flow: MutableStateFlow<Section<T>>, path: String, decode: (String) -> T) {
        jobs[slot]?.cancel()
        jobs[slot] = viewModelScope.launch {
            flow.value = flow.value.copy(loading = true, error = null)
            flow.value = try {
                val fetched = graph.repository.read(path)
                Section(decode(fetched.body), loading = false, offline = fetched.fromCache)
            } catch (error: IOException) {
                flow.value.copy(loading = false, error = error.message ?: "Could not load this section.")
            }
        }
    }

    fun loadHistory(range: String) = load("history", _history, "/api/solar/history?range=$range") { AppJson.decodeFromString<HistoryResponse>(it) }
    fun loadReports(year: String? = null) =
        load("reports", _reports, "/api/solar/reports" + (year?.let { "?year=$it" } ?: "")) { AppJson.decodeFromString<ReportsResponse>(it) }
    fun loadAppliances(range: String) = load("appliances", _appliances, "/api/reports?range=$range") { AppJson.decodeFromString<AppliancesReport>(it) }

    companion object {
        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = EnergyViewModel(graph) as T
        }
    }
}
