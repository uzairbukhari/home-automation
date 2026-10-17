package com.uzairbukhari.photon.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.data.ApiException
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.AppSettings
import com.uzairbukhari.photon.data.ProviderStatus
import com.uzairbukhari.photon.data.ProvidersResponse
import com.uzairbukhari.photon.data.SolarLatest
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

data class OverviewState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val latest: SolarLatest? = null,
    val providers: List<ProviderStatus> = emptyList(),
    val settings: AppSettings = AppSettings(),
    val savedAtMillis: Long? = null,
    val offline: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class OverviewViewModel(private val graph: Graph) : ViewModel() {
    private val _state = MutableStateFlow(OverviewState())
    val state: StateFlow<OverviewState> = _state.asStateFlow()

    private var loadJob: Job? = null

    /**
     * Reads the saved server copy; [pull] shows the pull-to-refresh spinner.
     * Only one load runs at a time (a timer tick never cancels a pull), and every state change is atomic.
     */
    fun load(pull: Boolean = false) {
        if (loadJob?.isActive == true) {
            if (!pull) return
            loadJob?.cancel()
        }
        loadJob = viewModelScope.launch {
            if (pull) _state.update { it.copy(refreshing = true) }
            try {
                val repo = graph.repository
                coroutineScope {
                    val latest = async { repo.read("/api/solar/latest?summary=1") }
                    val providers = async { runCatching { repo.read("/api/connection-status") }.getOrNull() }
                    val settings = async { runCatching { repo.read("/api/settings") }.getOrNull() }
                    val solar = latest.await()
                    val decoded = AppJson.decodeFromString<SolarLatest>(solar.body)
                    val providerList = providers.await()?.let { AppJson.decodeFromString<ProvidersResponse>(it.body).providers }
                    val appSettings = settings.await()?.let { AppJson.decodeFromString<AppSettings>(it.body) }
                    _state.update { old ->
                        old.copy(
                            loading = false,
                            refreshing = false,
                            latest = decoded,
                            providers = providerList ?: old.providers,
                            settings = appSettings ?: old.settings,
                            savedAtMillis = solar.savedAtMillis,
                            offline = solar.fromCache,
                            error = null,
                        )
                    }
                }
            } catch (error: ApiException) {
                // 503 means the server has no readings yet; show its own explanation.
                _state.update { it.copy(loading = false, refreshing = false, error = error.message) }
            } catch (error: IOException) {
                _state.update { it.copy(loading = false, refreshing = false, error = "Can't reach the server and nothing is saved on this phone yet.") }
            }
        }
    }

    /** Asks the server to collect from the inverter now, then reloads. */
    fun refreshFromInverter() {
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true, notice = null) }
            val notice = try {
                graph.repository.refreshNow()
                null
            } catch (error: ApiException) {
                if (error.status == 429) "Readings were refreshed a moment ago." else (error.message ?: "Refresh failed.")
            } catch (error: IOException) {
                "Can't reach the server."
            }
            _state.update { it.copy(notice = notice) }
            load(pull = true)
        }
    }

    fun dismissNotice() {
        _state.update { it.copy(notice = null) }
    }

    companion object {
        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = OverviewViewModel(graph) as T
        }
    }
}
