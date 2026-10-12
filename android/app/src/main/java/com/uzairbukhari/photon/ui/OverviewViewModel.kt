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
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    /** Reads the saved server copy; [pull] shows the pull-to-refresh spinner. */
    fun load(pull: Boolean = false) {
        viewModelScope.launch {
            if (pull) _state.value = _state.value.copy(refreshing = true)
            _state.value = try {
                val repo = graph.repository
                coroutineScope {
                    val latest = async { repo.read("/api/solar/latest?summary=1") }
                    val providers = async { runCatching { repo.read("/api/connection-status") }.getOrNull() }
                    val settings = async { runCatching { repo.read("/api/settings") }.getOrNull() }
                    val solar = latest.await()
                    _state.value.copy(
                        loading = false,
                        refreshing = false,
                        latest = AppJson.decodeFromString<SolarLatest>(solar.body),
                        providers = providers.await()?.let { AppJson.decodeFromString<ProvidersResponse>(it.body).providers } ?: _state.value.providers,
                        settings = settings.await()?.let { AppJson.decodeFromString<AppSettings>(it.body) } ?: _state.value.settings,
                        savedAtMillis = solar.savedAtMillis,
                        offline = solar.fromCache,
                        error = null,
                    )
                }
            } catch (error: ApiException) {
                // 503 means the server has no readings yet; show its own explanation.
                _state.value.copy(loading = false, refreshing = false, error = error.message)
            } catch (error: IOException) {
                _state.value.copy(loading = false, refreshing = false, error = "Can't reach the server and nothing is saved on this phone yet.")
            }
        }
    }

    /** Asks the server to collect from the inverter now, then reloads. */
    fun refreshFromInverter() {
        viewModelScope.launch {
            _state.value = _state.value.copy(refreshing = true, notice = null)
            val notice = try {
                graph.repository.refreshNow()
                "Collected the latest readings."
            } catch (error: ApiException) {
                if (error.status == 429) "Readings were refreshed a moment ago." else (error.message ?: "Refresh failed.")
            } catch (error: IOException) {
                "Can't reach the server."
            }
            _state.value = _state.value.copy(notice = notice)
            load(pull = true)
        }
    }

    fun dismissNotice() {
        _state.value = _state.value.copy(notice = null)
    }

    companion object {
        fun factory(graph: Graph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = OverviewViewModel(graph) as T
        }
    }
}
