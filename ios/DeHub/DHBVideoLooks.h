//
//  DHBVideoLooks.h
//  Camera looks — the iOS half.
//
//  Registers a frame processor per look with react-native-webrtc's
//  ProcessorProvider, so `track._setVideoEffect(name)` from JS has something to
//  resolve. Call +registerAll once, from the app delegate.
//
//  Objective-C rather than Swift on purpose: the delegate is declared as
//  `- (RTCVideoFrame *)capturer:didCaptureVideoFrame:`, and Swift's importer
//  rewrites selectors like that one ("omit needless words" strips the trailing
//  type name), so the method that satisfies the protocol there is not the one
//  it reads as. In Objective-C the selector is what it says it is.
//

#import <Foundation/Foundation.h>

@interface DHBVideoLooks : NSObject

/** Registers every look. Safe to call more than once. */
+ (void)registerAll;

@end
