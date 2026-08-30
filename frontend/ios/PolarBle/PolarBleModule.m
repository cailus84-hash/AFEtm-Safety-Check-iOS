// PolarBleModule.m — Objective-C bridge that exports the Swift class to
// React Native. Method signatures MUST match the @objc names declared
// in PolarBleModule.swift.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PolarBleModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startScan:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopScan:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(connect:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(disconnect:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

+ (BOOL)requiresMainQueueSetup { return YES; }

@end
