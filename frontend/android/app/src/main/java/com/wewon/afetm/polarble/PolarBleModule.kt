package com.wewon.afetm.polarble

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
import java.util.UUID

/**
 * PolarBleModule — thin React Native bridge over the official Polar BLE
 * SDK (Android). HR streaming ONLY. The AFEtm classification stays
 * server-side; this module never derives the final zone locally.
 */
class PolarBleModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val api: PolarBleApi = PolarBleApiDefaultImpl.defaultImplementation(
        reactContext,
        setOf(PolarBleApi.PolarBleSdkFeature.FEATURE_HR)
    )
    private var scanDisposable: Disposable? = null

    init {
        api.setPolarFilter(true)
        api.setApiCallback(object : PolarBleApiCallback() {
            override fun blePowerStateChanged(powered: Boolean) {
                sendState("bt-" + if (powered) "on" else "off")
            }
            override fun deviceConnecting(info: PolarDeviceInfo) {
                sendState("connecting", info.deviceId, info.name)
            }
            override fun deviceConnected(info: PolarDeviceInfo) {
                sendState("connected", info.deviceId, info.name)
            }
            override fun deviceDisconnected(info: PolarDeviceInfo) {
                sendState("disconnected", info.deviceId, info.name)
            }
            override fun hrFeatureReady(identifier: String) {
                sendState("hr-ready", identifier)
            }
            override fun batteryLevelReceived(identifier: String, level: Int) {
                val m = Arguments.createMap()
                m.putString("status", "battery"); m.putString("id", identifier); m.putInt("level", level)
                emit("polar-state", m)
            }
            override fun hrNotificationReceived(identifier: String, data: PolarHrData.PolarHrSample) {
                val m = Arguments.createMap()
                m.putString("id", identifier)
                m.putInt("hr", data.hr)
                m.putBoolean("contactStatus", data.contactStatus)
                m.putBoolean("contactStatusSupported", data.contactStatusSupported)
                val rr = Arguments.createArray()
                for (v in data.rrsMs) rr.pushInt(v)
                m.putArray("rrsMs", rr)
                emit("polar-hr", m)
            }
        })
    }

    override fun getName() = "PolarBleModule"

    // ------- JS API -------

    @ReactMethod
    fun startScan(promise: Promise) {
        scanDisposable?.dispose()
        scanDisposable = api.searchForDevice()
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ info ->
                val m = Arguments.createMap()
                m.putString("id", info.deviceId)
                m.putString("name", info.name)
                m.putInt("rssi", info.rssi)
                m.putString("address", info.address)
                m.putBoolean("connectable", info.connectable)
                emit("polar-device", m)
            }, { err ->
                Log.w("PolarBle", "scan error: $err")
                val m = Arguments.createMap()
                m.putString("status", "scan-error")
                m.putString("message", err.toString())
                emit("polar-state", m)
            })
        promise.resolve(null)
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        scanDisposable?.dispose()
        scanDisposable = null
        promise.resolve(null)
    }

    @ReactMethod
    fun connect(deviceId: String, promise: Promise) {
        try {
            api.connectToDevice(deviceId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("polar_connect_error", e)
        }
    }

    @ReactMethod
    fun disconnect(deviceId: String, promise: Promise) {
        try {
            api.disconnectFromDevice(deviceId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("polar_disconnect_error", e)
        }
    }

    // JS event emitter contract — required by React Native ≥ 0.65.
    @ReactMethod fun addListener(eventName: String) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Int) { /* no-op */ }

    // ------- helpers -------

    private fun emit(name: String, body: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, body)
    }
    private fun sendState(status: String, id: String? = null, name: String? = null) {
        val m = Arguments.createMap()
        m.putString("status", status)
        id?.let { m.putString("id", it) }
        name?.let { m.putString("name", it) }
        emit("polar-state", m)
    }
}
