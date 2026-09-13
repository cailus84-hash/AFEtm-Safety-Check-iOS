import Foundation
import CoreBluetooth
import PolarBleSdk
import RxSwift

private func receiptNow() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

// A separate SDK/observer owns each immutable connection context. Queued
// callbacks can never be relabeled by replacing a shared observer's session ID.
private final class PolarAcquisition: PolarBleApiObserver, PolarBleApiDeviceHrObserver,
  PolarBleApiPowerStateObserver {
  let deviceId: String
  let sessionId: String
  let connectionId: String
  let api = PolarBleApiDefaultImpl.polarImplementation(DispatchQueue.main, features: [.feature_hr])
  private let emit: (String, [String: Any]) -> Void
  private var active = true
  private var connected = false
  private var hasSeenPowerOn = false

  init(_ deviceId: String, _ sessionId: String, _ connectionId: String,
       emit: @escaping (String, [String: Any]) -> Void) {
    self.deviceId = deviceId
    self.sessionId = sessionId
    self.connectionId = connectionId
    self.emit = emit
    api.observer = self
    api.deviceHrObserver = self
    api.powerStateObserver = self
    api.automaticReconnection = false
    api.polarFilter(true)
  }
  private func send(_ event: String, _ body: [String: Any]) {
    var tagged = body
    tagged["sessionId"] = sessionId
    tagged["connectionId"] = connectionId
    emit(event, tagged)
  }
  func close() {
    active = false
    connected = false
    try? api.disconnectFromDevice(deviceId)
  }
  func deviceConnecting(_ info: PolarDeviceInfo) {
    guard active, info.deviceId == deviceId else { return }
    send("polar-state", ["status": "connecting", "id": info.deviceId, "name": info.name])
  }
  func deviceConnected(_ info: PolarDeviceInfo) {
    guard active, !connected, info.deviceId == deviceId else { return }
    connected = true
    send("polar-state", ["status": "connected", "id": info.deviceId, "name": info.name])
  }
  func deviceDisconnected(_ info: PolarDeviceInfo, pairingError: Bool) {
    guard active, info.deviceId == deviceId else { return }
    active = false
    connected = false
    send("polar-state", ["status": "disconnected", "id": info.deviceId, "pairingError": pairingError])
  }
  // SDK observer tuple, not the distinct PolarHrData streaming array.
  func hrValueReceived(_ identifier: String,
    data: (hr: UInt8, rrs: [Int], rrsMs: [Int], contact: Bool, contactSupported: Bool)) {
    let receivedAt = receiptNow() // Before packaging or React Native dispatch.
    guard active, connected, identifier == deviceId else { return }
    send("polar-hr", ["id": identifier, "hr": Int(data.hr), "receivedAt": receivedAt,
      "contactStatus": data.contact, "contactStatusSupported": data.contactSupported,
      "rrsMs": data.rrsMs])
  }
  func blePowerOn() { hasSeenPowerOn = true }
  func blePowerOff() {
    // A fresh CoreBluetooth manager starts in unknown/off state. This initial
    // notification is not a disconnect from an established connection.
    guard active, hasSeenPowerOn || connected else { return }
    active = false
    connected = false
    send("polar-state", ["status": "bt-off", "id": deviceId])
  }
}

// Acquisition only. Authoritative AFE interpretation remains server-side.
@objc(PolarBleModule)
class PolarBleModule: RCTEventEmitter {
  private let scanner = PolarBleApiDefaultImpl.polarImplementation(DispatchQueue.main, features: [.feature_hr])
  private var scanDisposable: Disposable?
  private var acquisition: PolarAcquisition?
  private var listening = false

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["polar-device", "polar-hr", "polar-state"] }
  override func startObserving() { listening = true }
  override func stopObserving() { listening = false }
  // Pure clock read: no dispatch, locks, SDK or UI access.
  @objc func monotonicNow() -> NSNumber { NSNumber(value: receiptNow()) }
  private func send(_ event: String, _ body: [String: Any]) {
    guard listening else { return }
    sendEvent(withName: event, body: body)
  }
  @objc(startScan:reject:)
  func startScan(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    scanDisposable?.dispose()
    scanner.polarFilter(true)
    scanDisposable = scanner.searchForDevice().observe(on: MainScheduler.instance)
      .subscribe(onNext: { [weak self] info in
        self?.send("polar-device", ["id": info.deviceId, "name": info.name, "rssi": info.rssi,
          "address": info.address.uuidString, "connectable": info.connectable])
      }, onError: { [weak self] error in
        self?.send("polar-state", ["status": "scan-error", "message": "\(error)"])
      })
    resolve(nil)
  }
  @objc(stopScan:reject:)
  func stopScan(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    scanDisposable?.dispose()
    scanDisposable = nil
    resolve(nil)
  }
  @objc(connectSession:sessionId:connectionId:resolver:rejecter:)
  func connectSession(_ deviceId: String, sessionId: String, connectionId: String,
    resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard acquisition == nil else {
      rejecter("polar_session_busy", "Close the active acquisition before connecting.", nil)
      return
    }
    let context = PolarAcquisition(deviceId, sessionId, connectionId) { [weak self] event, body in
      self?.send(event, body)
    }
    acquisition = context
    do {
      try context.api.connectToDevice(deviceId)
      resolver(nil)
    } catch {
      context.close()
      acquisition = nil
      rejecter("polar_connect_error", "\(error)", error)
    }
  }
  @objc(disconnectSession:sessionId:connectionId:resolver:rejecter:)
  func disconnectSession(_ deviceId: String, sessionId: String, connectionId: String,
    resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    if let context = acquisition, context.deviceId == deviceId,
       context.sessionId == sessionId, context.connectionId == connectionId {
      context.close()
      acquisition = nil
    }
    resolver(nil) // Old cleanup commands cannot disconnect a newer acquisition.
  }
}
