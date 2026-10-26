//
//  DHBStudio.h
//  The phone studio — the iOS half of android/.../studio/.
//
//  Two frame processors registered with react-native-webrtc's ProcessorProvider
//  beside the camera looks:
//
//    dhb-background  person segmentation (Vision) with the room behind the
//                    creator blurred, filled with a colour, or replaced by a
//                    picture.
//    dhb-studio      a full-frame scene card that replaces the picture, and a
//                    translucent overlay (logos, widgets) composited on top.
//
//  plus the `DHBStudio` native module JS drives them through
//  (libs/phoneStudio.ts). Call +registerProcessors once from the app delegate.
//

#import <Foundation/Foundation.h>

// The RCTBridgeModule conformance is declared in the .m, so this header stays
// importable from the Swift bridging header without pulling React in.
@interface DHBStudio : NSObject

/** Registers both processors. Safe to call more than once. */
+ (void)registerProcessors;

@end
