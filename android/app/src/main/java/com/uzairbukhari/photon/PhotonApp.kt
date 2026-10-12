package com.uzairbukhari.photon

import android.app.Application
import com.uzairbukhari.photon.work.Notifications
import com.uzairbukhari.photon.work.Scheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import com.uzairbukhari.photon.data.ApiClient
import com.uzairbukhari.photon.data.AppPrefs
import com.uzairbukhari.photon.data.Repository
import com.uzairbukhari.photon.data.SecureStore
import com.uzairbukhari.photon.data.Session

/** Hand-wired app singletons; small enough not to need a DI framework. */
class Graph(app: Application) {
    val store = SecureStore(app)
    val session = Session(store)
    val prefs = AppPrefs(store)
    val api = ApiClient(session)
    val repository = Repository(api, store)
}

class PhotonApp : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    lateinit var graph: Graph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = Graph(this)
        Notifications.createChannel(this)
        appScope.launch {
            graph.session.signedIn.collect { if (it) Scheduler.start(this@PhotonApp) else Scheduler.stop(this@PhotonApp) }
        }
    }
}
