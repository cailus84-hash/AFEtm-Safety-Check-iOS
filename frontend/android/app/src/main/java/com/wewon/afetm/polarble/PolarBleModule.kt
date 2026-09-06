package com.wewon.afetm.polarble

import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.polar.sdk.api.PolarBleApi
import com.polar.sdk.api.PolarBleApiCallback
import com.polar.sdk.api.PolarBleApiDefaultImpl
import com.polar.sdk.api.model.PolarDeviceInfo
import com.polar.sdk.api.model.PolarHrData
import io.reactivex.rxjava3.android.schedulers.AndroidSchedulers
import io.reactivex.rxjava3.disposables.Disposable

// Acquisition only. No AFE physiological interpretation.
class PolarBleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private fun newApi() = PolarBleApiDefaultImpl.defaultImplementation(
        reactApplicationContext, setOf(PolarBleApi.PolarBleSdkFeature.FEATURE_HR)
    ).also { it.setPolarFilter(true); it.setAutomaticReconnection(false) }
    private var scanner: PolarBleApi? = null
    private var scanDisposable: Disposable? = null
    private var acquisition: Acquisition? = null // Accessed only on the UI thread.

    private inner class Acquisition(val deviceId: String, val sessionId: String, val connectionId: String) {
        val api = newApi()
        @Volatile private var active = true
        @Volatile private var connected = false
        @Volatile private var hasSeenPowerOn = false
        init {
            // Polar Android 5.5.0 is a singleton. The previous owner MUST be
            // shut down (which clears that singleton) before this is constructed.
            api.setApiCallback(object : PolarBleApiCallback() {
                override fun blePowerStateChanged(powered: Boolean) {
                    if (powered) hasSeenPowerOn = true
                    if (!powered && active && (hasSeenPowerOn || connected)) {
                        active = false; connected = false
                        state("bt-off")
                    }
                }
                override fun deviceConnecting(info: PolarDeviceInfo) {
                    if (active && info.deviceId == deviceId) state("connecting", info.name)
                }
                override fun deviceConnected(info: PolarDeviceInfo) {
                    if (active && !connected && info.deviceId == deviceId) {
                        connected = true
                        state("connected", info.name)
                    }
                }
                override fun deviceDisconnected(info: PolarDeviceInfo) {
                    if (active && info.deviceId == deviceId) {
                        active = false; connected = false
                        state("disconnected", info.name)
                    }
                }
                override fun hrNotificationReceived(identifier: String, data: PolarHrData.PolarHrSample) {
                    val receivedAt = monotonicNow() // First operation at SDK callback boundary.
                    if (!active || !connected || identifier != deviceId) return
                    val m = envelope()
                    m.putInt("hr", data.hr)
                    m.putDouble("receivedAt", receivedAt)
                    m.putBoolean("contactStatus", data.contactStatus)
                    m.putBoolean("contactStatusSupported", data.contactStatusSupported)
                    val rr = Arguments.createArray()
                    for (v in data.rrsMs) rr.pushInt(v)
                    m.putArray("rrsMs", rr)
                    emit("polar-hr", m)
                }
            })
        }
        private fun envelope() = Arguments.createMap().also {
            it.putString("id", deviceId)
            it.putString("sessionId", sessionId)
            it.putString("connectionId", connectionId)
        }
        private fun state(status: String, name: String? = null) {
            val m = envelope()
            m.putString("status", status)
            name?.let { m.putString("name", it) }
            emit("polar-state", m)
        }
        fun close() {
            active = false; connected = false
            try { api.disconnectFromDevice(deviceId) } finally { api.shutDown() }
        }
    }

    override fun getName() = "PolarBleModule"
    // Pure synchronous clock read; no UI dispatch, locks or SDK access.
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun monotonicNow(): Double = SystemClock.elapsedRealtimeNanos().toDouble() / 1_000_000.0

    @ReactMethod
    fun startScan(promise: Promise) {
      UiThreadUtil.runOnUiThread {
        if (acquisition != null) {
            promise.reject("polar_session_busy", "An acquisition is active.")
            return@runOnUiThread
        }
        try {
        scanDisposable?.dispose()
        val scanApi = scanner ?: newApi().also { scanner = it }
        scanDisposable = scanApi.searchForDevice().observeOn(AndroidSchedulers.mainThread())
            .subscribe({ info ->
                val m = Arguments.createMap()
                m.putString("id", info.deviceId); m.putString("name", info.name)
                m.putInt("rssi", info.rssi); m.putString("address", info.address)
                m.putBoolean("connectable", info.connectable)
                emit("polar-device", m)
            }, { err ->
                Log.w("PolarBle", "scan error: $err")
                val m = Arguments.createMap()
                m.putString("status", "scan-error"); m.putString("message", err.toString())
                emit("polar-state", m)
            })
        promise.resolve(null)
        } catch (e: Exception) { promise.reject("polar_scan_error", e) }
      }
    }
    @ReactMethod
    fun stopScan(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try { closeScanner(); promise.resolve(null) }
            catch (e: Exception) { promise.reject("polar_scan_error", e) }
        }
    }
    private fun closeScanner() {
        scanDisposable?.dispose(); scanDisposable = null
        scanner?.shutDown() // Clears SDK singleton; never reuse an old callback owner.
        scanner = null
    }
    @ReactMethod
    fun connectSession(deviceId: String, sessionId: String, connectionId: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            if (acquisition != null) {
                promise.reject("polar_session_busy", "Close the active acquisition before connecting.")
                return@runOnUiThread
            }
            try {
                closeScanner()
                val context = Acquisition(deviceId, sessionId, connectionId)
                acquisition = context
                context.api.connectToDevice(deviceId)
                promise.resolve(null)
            } catch (e: Exception) {
                try { acquisition?.close(); acquisition = null } catch (_: Exception) {
                    // Keep the inactive owner locked if shutdown failed.
                }
                promise.reject("polar_connect_error", e)
            }
        }
    }
    @ReactMethod
    fun disconnectSession(deviceId: String, sessionId: String, connectionId: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val context = acquisition
            if (context != null && context.deviceId == deviceId && context.sessionId == sessionId
                && context.connectionId == connectionId) {
                try { context.close(); acquisition = null } catch (e: Exception) {
                    promise.reject("polar_disconnect_error", e)
                    return@runOnUiThread
                }
            }
            promise.resolve(null) // Stale cleanup cannot disconnect a newer context.
        }
    }
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
    private fun emit(name: String, body: WritableMap) {
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, body)
    }
}
