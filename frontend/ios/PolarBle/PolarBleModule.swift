import Foundation
import CoreBluetooth
import PolarBleSdk
import RxSwift

/**
 * PolarBleModule — thin React Native bridge over the official Polar BLE
 * SDK (iOS). Emits live HR samples ONLY. All classification / zone /
 * pattern logic remains on the WeWoN Replit backend; this module never
 * derives the AFE result on-device.
 *
 * Supports Polar Verity Sense, H10, OH1, H9 and any Polar HRM. For
 * non-Polar HRM straps the JS layer keeps using react-native-ble-plx.
 */
@objc(PolarBleModule)
class PolarBleModule: RCTEventEmitter, PolarBleApiObserver, PolarBleApiDeviceHrObserver,
                     PolarBleApiDeviceInfoObserver, PolarBleApiDeviceFeaturesObserver,
                     PolarBleApiPowerStateObserver {

  private let api: PolarBleApi = PolarBleApiDefaultImpl.polarImplementation(
    DispatchQueue.main,
    features: [.feature_hr]
  )
  private var disposables = DisposeBag()
  private var scanDisposable: Disposable?
  private var listening = false

  override init() {
    super.init()
    api.observer = self
    api.deviceHrObserver = self
    api.deviceFeaturesObserver = self
    api.deviceInfoObserver = self
    api.powerStateObserver = self
    api.polarFilter(true)
  }

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! {
    return ["polar-device", "polar-hr", "polar-state"]
  }
  override func startObserving() { listening = true }
  override func stopObserving() { listening = false }

  private func send(_ name: String, _ body: Any) {
    guard listening else { return }
    self.sendEvent(withName: name, body: body)
  }

  // MARK: - JS API

  @objc(startScan:reject:)
  func startScan(_ resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
    scanDisposable?.dispose()
    scanDisposable = api.searchForDevice()
      .observe(on: MainScheduler.instance)
      .subscribe(onNext: { [weak self] info in
        self?.send("polar-device", [
          "id": info.deviceId,
          "name": info.name,
          "rssi": info.rssi,
          "address": info.address,
          "connectable": info.connectable,
        ])
      }, onError: { err in
        // Non-fatal — surface via state event and stop.
        self.send("polar-state", ["status": "scan-error", "message": "\(err)"])
      })
    resolve(nil)
  }

  @objc(stopScan:reject:)
  func stopScan(_ resolve: @escaping RCTPromiseResolveBlock,
                reject: @escaping RCTPromiseRejectBlock) {
    scanDisposable?.dispose()
    scanDisposable = nil
    resolve(nil)
  }

  @objc(connect:resolver:rejecter:)
  func connect(_ deviceId: String,
               resolver: @escaping RCTPromiseResolveBlock,
               rejecter: @escaping RCTPromiseRejectBlock) {
    do {
      try api.connectToDevice(deviceId)
      resolver(nil)
    } catch let err {
      rejecter("polar_connect_error", "\(err)", err)
    }
  }

  @objc(disconnect:resolver:rejecter:)
  func disconnect(_ deviceId: String,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {
    do {
      try api.disconnectFromDevice(deviceId)
      resolver(nil)
    } catch let err {
      rejecter("polar_disconnect_error", "\(err)", err)
    }
  }

  // MARK: - Polar callbacks (forwarded to JS)

  func deviceConnecting(_ info: PolarDeviceInfo) {
    send("polar-state", ["status": "connecting", "id": info.deviceId, "name": info.name])
  }
  func deviceConnected(_ info: PolarDeviceInfo) {
    send("polar-state", ["status": "connected", "id": info.deviceId, "name": info.name])
  }
  func deviceDisconnected(_ info: PolarDeviceInfo, pairingError: Bool) {
    send("polar-state", ["status": "disconnected", "id": info.deviceId, "pairingError": pairingError])
  }

  func hrValueReceived(_ identifier: String, data: PolarHrData) {
    // data is [PolarHrSample]; we forward the last sample.
    guard let sample = data.last else { return }
    send("polar-hr", [
      "id": identifier,
      "hr": Int(sample.hr),
      "contactStatus": sample.contactStatus,
      "contactStatusSupported": sample.contactStatusSupported,
      "rrsMs": sample.rrsMs,
    ])
  }

  func hrFeatureReady(_ identifier: String) {
    send("polar-state", ["status": "hr-ready", "id": identifier])
  }

  func blePowerOn() { send("polar-state", ["status": "bt-on"]) }
  func blePowerOff() { send("polar-state", ["status": "bt-off"]) }
  func batteryLevelReceived(_ identifier: String, batteryLevel: UInt) {
    send("polar-state", ["status": "battery", "id": identifier, "level": Int(batteryLevel)])
  }
  func disInformationReceived(_ identifier: String, uuid: CBUUID, value: String) {}
  func ftpFeatureReady(_ identifier: String) {}
  func streamingFeaturesReady(_ identifier: String, streamingFeatures: Set<PolarDeviceDataType>) {}
}
