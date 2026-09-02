//
//  DHBVideoLooks.m
//
//  The iOS counterpart to android/.../videolooks/VideoLooks.kt. Same nine
//  looks, same constants, so a broadcast looks identical on either phone.
//
//  The two platforms differ in exactly one thing that matters here: the pixel
//  layout. Android hands over I420 — three separate planes, U and V apart. iOS
//  hands over NV12 — a luma plane and ONE interleaved CbCr plane. The colour
//  maths is unchanged; only the addressing is, and interleaving actually makes
//  it cheaper, because a chroma pair is one read of two adjacent bytes.
//
//  Two rules this file exists under, both different from Android's:
//
//  1. **There is no null fallback.** VideoEffectProcessor.m passes whatever
//     comes back straight to the video source, so returning nil is a crash, not
//     a pass-through. Every failure path returns the ORIGINAL frame.
//  2. **The camera's buffer is never written to.** Output is allocated from our
//     own pool. An in-place write that one device disallows would corrupt the
//     picture in a way no amount of reading the code would reveal; a pool that
//     fails to allocate just gives the creator an unfiltered broadcast.
//

#import "DHBVideoLooks.h"

#import "ProcessorProvider.h"
#import "VideoFrameProcessor.h"

#import <CoreVideo/CoreVideo.h>

#import <WebRTC/RTCCVPixelBuffer.h>
#import <WebRTC/RTCVideoFrame.h>
#import <WebRTC/RTCVideoFrameBuffer.h>

/** Neutral chroma. 128 in both components is grey — no colour at all. */
static const int kNeutral = 128;

/** Fixed point for the chroma maths: 256 = 1.0, matching the Kotlin. */
static const int kOne = 256;

static NSString *const kLookSoft = @"soft";
static NSString *const kLookMono = @"mono";
static NSString *const kLookNoir = @"noir";
static NSString *const kLookWarm = @"warm";
static NSString *const kLookCool = @"cool";
static NSString *const kLookVivid = @"vivid";
static NSString *const kLookNeon = @"neon";
static NSString *const kLookVHS = @"vhs";
static NSString *const kLookPixelate = @"pixelate";

static inline uint8_t DHBClamp(int v) {
    return (uint8_t)(v < 0 ? 0 : (v > 255 ? 255 : v));
}

#pragma mark - Processor

@interface DHBLookProcessor : NSObject <VideoFrameProcessorDelegate>
- (instancetype)initWithLook:(NSString *)look;
@end

@implementation DHBLookProcessor {
    NSString *_look;
    CVPixelBufferPoolRef _pool;
    size_t _poolWidth;
    size_t _poolHeight;
    OSType _poolFormat;
    uint8_t _luma[256];
    BOOL _hasLuma;
}

- (instancetype)initWithLook:(NSString *)look {
    self = [super init];
    if (self) {
        _look = [look copy];
        _pool = NULL;
        _poolWidth = 0;
        _poolHeight = 0;
        _poolFormat = 0;
        _hasLuma = NO;

        // Tone curves, precomputed once. The same two curves as the Kotlin:
        // Soft lifts shadows and midtones, Noir crushes toward contrast.
        if ([look isEqualToString:kLookSoft]) {
            for (int i = 0; i < 256; i++) _luma[i] = DHBClamp(i + (255 - i) * 10 / 100 + 6);
            _hasLuma = YES;
        } else if ([look isEqualToString:kLookNoir]) {
            for (int i = 0; i < 256; i++) _luma[i] = DHBClamp(kNeutral + (i - kNeutral) * 150 / 100 - 8);
            _hasLuma = YES;
        }
    }
    return self;
}

- (void)dealloc {
    if (_pool) {
        CVPixelBufferPoolRelease(_pool);
        _pool = NULL;
    }
}

/**
 * The output pool, rebuilt whenever the capture geometry or format changes —
 * which happens on a camera flip between devices with different sensors.
 */
- (BOOL)ensurePoolForWidth:(size_t)width height:(size_t)height format:(OSType)format {
    if (_pool && _poolWidth == width && _poolHeight == height && _poolFormat == format) {
        return YES;
    }
    if (_pool) {
        CVPixelBufferPoolRelease(_pool);
        _pool = NULL;
    }

    NSDictionary *poolAttributes = @{
        (id)kCVPixelBufferPoolMinimumBufferCountKey : @(3),
    };
    // IOSurface backing is not optional: the encoder wants to take these
    // buffers without another copy, and a plain malloc-backed buffer forces one.
    NSDictionary *bufferAttributes = @{
        (id)kCVPixelBufferPixelFormatTypeKey : @(format),
        (id)kCVPixelBufferWidthKey : @(width),
        (id)kCVPixelBufferHeightKey : @(height),
        (id)kCVPixelBufferIOSurfacePropertiesKey : @{},
    };

    CVReturn status = CVPixelBufferPoolCreate(kCFAllocatorDefault,
                                              (__bridge CFDictionaryRef)poolAttributes,
                                              (__bridge CFDictionaryRef)bufferAttributes,
                                              &_pool);
    if (status != kCVReturnSuccess) {
        _pool = NULL;
        return NO;
    }
    _poolWidth = width;
    _poolHeight = height;
    _poolFormat = format;
    return YES;
}

- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer
       didCaptureVideoFrame:(RTCVideoFrame *)frame {
    // Every early return below hands back the frame it was given. See the note
    // at the top: nil is not an option on this platform.
    if (frame == nil) return frame;

    if (![frame.buffer isKindOfClass:[RTCCVPixelBuffer class]]) return frame;
    RTCCVPixelBuffer *source = (RTCCVPixelBuffer *)frame.buffer;
    CVPixelBufferRef sourceBuffer = source.pixelBuffer;
    if (sourceBuffer == NULL) return frame;

    OSType format = CVPixelBufferGetPixelFormatType(sourceBuffer);
    if (format != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange &&
        format != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange) {
        // Not NV12 — a screen capture, or a simulator quirk. Leave it alone
        // rather than reinterpreting bytes that mean something else.
        return frame;
    }

    size_t width = CVPixelBufferGetWidth(sourceBuffer);
    size_t height = CVPixelBufferGetHeight(sourceBuffer);
    if (width < 2 || height < 2) return frame;

    // An adapted frame exposes a sub-rect of its buffer, and honouring that
    // correctly is a different job from filtering. The processor runs on the
    // raw capture, so this should never be true; if it ever is, the look turns
    // itself off rather than reframing the shot.
    if ((size_t)source.width != width || (size_t)source.height != height) return frame;

    if (![self ensurePoolForWidth:width height:height format:format]) return frame;

    CVPixelBufferRef destination = NULL;
    if (CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, _pool, &destination) != kCVReturnSuccess ||
        destination == NULL) {
        return frame;
    }

    if (CVPixelBufferLockBaseAddress(sourceBuffer, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) {
        CVPixelBufferRelease(destination);
        return frame;
    }
    if (CVPixelBufferLockBaseAddress(destination, 0) != kCVReturnSuccess) {
        CVPixelBufferUnlockBaseAddress(sourceBuffer, kCVPixelBufferLock_ReadOnly);
        CVPixelBufferRelease(destination);
        return frame;
    }

    [self renderFrom:sourceBuffer to:destination width:width height:height];

    CVPixelBufferUnlockBaseAddress(destination, 0);
    CVPixelBufferUnlockBaseAddress(sourceBuffer, kCVPixelBufferLock_ReadOnly);

    RTCCVPixelBuffer *wrapped = [[RTCCVPixelBuffer alloc] initWithPixelBuffer:destination];
    // The wrapper retains it; this balances the pool's handout.
    CVPixelBufferRelease(destination);
    if (wrapped == nil) return frame;

    return [[RTCVideoFrame alloc] initWithBuffer:wrapped
                                        rotation:frame.rotation
                                     timeStampNs:frame.timeStampNs];
}

#pragma mark - Planes

- (void)renderFrom:(CVPixelBufferRef)src to:(CVPixelBufferRef)dst width:(size_t)width height:(size_t)height {
    uint8_t *srcY = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(src, 0);
    uint8_t *dstY = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(dst, 0);
    size_t srcYStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0);
    size_t dstYStride = CVPixelBufferGetBytesPerRowOfPlane(dst, 0);

    uint8_t *srcUV = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(src, 1);
    uint8_t *dstUV = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(dst, 1);
    size_t srcUVStride = CVPixelBufferGetBytesPerRowOfPlane(src, 1);
    size_t dstUVStride = CVPixelBufferGetBytesPerRowOfPlane(dst, 1);

    if (srcY == NULL || dstY == NULL || srcUV == NULL || dstUV == NULL) return;

    // Chroma is half resolution in both directions; each sample is a Cb,Cr pair.
    size_t cw = (width + 1) / 2;
    size_t ch = (height + 1) / 2;

    if ([_look isEqualToString:kLookMono]) {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self fillChroma:dstUV stride:dstUVStride width:cw rows:ch];

    } else if ([_look isEqualToString:kLookNoir]) {
        [self lutPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride width:width rows:height];
        [self fillChroma:dstUV stride:dstUVStride width:cw rows:ch];

    } else if ([_look isEqualToString:kLookSoft]) {
        [self lutPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride width:width rows:height];
        [self gradeChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch gain:236 cbShift:0 crShift:3];

    } else if ([_look isEqualToString:kLookWarm]) {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self gradeChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch gain:268 cbShift:-8 crShift:12];

    } else if ([_look isEqualToString:kLookCool]) {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self gradeChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch gain:268 cbShift:14 crShift:-10];

    } else if ([_look isEqualToString:kLookVivid]) {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self gradeChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch gain:400 cbShift:0 crShift:0];

    } else if ([_look isEqualToString:kLookNeon]) {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self rotateChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                     width:cw rows:ch cos:-241 sin:-88 saturation:460];

    } else if ([_look isEqualToString:kLookVHS]) {
        size_t drift = cw / 90;
        if (drift < 1) drift = 1;
        [self scanlines:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride width:width rows:height];
        [self bleedChroma:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch drift:(int)drift];

    } else if ([_look isEqualToString:kLookPixelate]) {
        size_t block = width / 32;
        if (block < 4) block = 4;
        size_t chromaBlock = block / 2;
        if (chromaBlock < 2) chromaBlock = 2;
        [self mosaicPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride
                    width:width rows:height block:block unit:1];
        [self mosaicPlane:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride
                    width:cw rows:ch block:chromaBlock unit:2];

    } else {
        [self copyPlane:srcY srcStride:srcYStride dst:dstY dstStride:dstYStride bytes:width rows:height];
        [self copyPlane:srcUV srcStride:srcUVStride dst:dstUV dstStride:dstUVStride bytes:cw * 2 rows:ch];
    }
}

- (void)copyPlane:(const uint8_t *)src srcStride:(size_t)srcStride
              dst:(uint8_t *)dst dstStride:(size_t)dstStride
            bytes:(size_t)bytes rows:(size_t)rows {
    for (size_t y = 0; y < rows; y++) {
        memcpy(dst + y * dstStride, src + y * srcStride, bytes);
    }
}

/** Grey. Cb and Cr are both 128, so the interleaved plane is one memset. */
- (void)fillChroma:(uint8_t *)dst stride:(size_t)stride width:(size_t)width rows:(size_t)rows {
    for (size_t y = 0; y < rows; y++) {
        memset(dst + y * stride, kNeutral, width * 2);
    }
}

- (void)lutPlane:(const uint8_t *)src srcStride:(size_t)srcStride
             dst:(uint8_t *)dst dstStride:(size_t)dstStride
           width:(size_t)width rows:(size_t)rows {
    if (!_hasLuma) {
        [self copyPlane:src srcStride:srcStride dst:dst dstStride:dstStride bytes:width rows:rows];
        return;
    }
    for (size_t y = 0; y < rows; y++) {
        const uint8_t *s = src + y * srcStride;
        uint8_t *d = dst + y * dstStride;
        for (size_t x = 0; x < width; x++) d[x] = _luma[s[x]];
    }
}

/** out = 128 + (in - 128) * gain/256 + shift, per component. */
- (void)gradeChroma:(const uint8_t *)src srcStride:(size_t)srcStride
                dst:(uint8_t *)dst dstStride:(size_t)dstStride
              width:(size_t)width rows:(size_t)rows
               gain:(int)gain cbShift:(int)cbShift crShift:(int)crShift {
    for (size_t y = 0; y < rows; y++) {
        const uint8_t *s = src + y * srcStride;
        uint8_t *d = dst + y * dstStride;
        for (size_t x = 0; x < width; x++) {
            int cb = (int)s[x * 2] - kNeutral;
            int cr = (int)s[x * 2 + 1] - kNeutral;
            d[x * 2] = DHBClamp(kNeutral + (cb * gain) / kOne + cbShift);
            d[x * 2 + 1] = DHBClamp(kNeutral + (cr * gain) / kOne + crShift);
        }
    }
}

/** Rotating the (Cb,Cr) vector IS a hue rotation, then saturate it. */
- (void)rotateChroma:(const uint8_t *)src srcStride:(size_t)srcStride
                 dst:(uint8_t *)dst dstStride:(size_t)dstStride
               width:(size_t)width rows:(size_t)rows
                 cos:(int)cosT sin:(int)sinT saturation:(int)saturation {
    for (size_t y = 0; y < rows; y++) {
        const uint8_t *s = src + y * srcStride;
        uint8_t *d = dst + y * dstStride;
        for (size_t x = 0; x < width; x++) {
            int cb = (int)s[x * 2] - kNeutral;
            int cr = (int)s[x * 2 + 1] - kNeutral;
            int rb = (cb * cosT - cr * sinT) / kOne;
            int rr = (cb * sinT + cr * cosT) / kOne;
            d[x * 2] = DHBClamp(kNeutral + (rb * saturation) / kOne);
            d[x * 2 + 1] = DHBClamp(kNeutral + (rr * saturation) / kOne);
        }
    }
}

/**
 * Chroma dragged apart horizontally — the colour bleed of a worn tape.
 * Cb goes one way and Cr the other, which is why this cannot be a row memcpy.
 */
- (void)bleedChroma:(const uint8_t *)src srcStride:(size_t)srcStride
                dst:(uint8_t *)dst dstStride:(size_t)dstStride
              width:(size_t)width rows:(size_t)rows drift:(int)drift {
    for (size_t y = 0; y < rows; y++) {
        const uint8_t *s = src + y * srcStride;
        uint8_t *d = dst + y * dstStride;
        for (size_t x = 0; x < width; x++) {
            int cbX = (int)x + drift;
            int crX = (int)x - drift;
            if (cbX < 0) cbX = 0;
            if (cbX > (int)width - 1) cbX = (int)width - 1;
            if (crX < 0) crX = 0;
            if (crX > (int)width - 1) crX = (int)width - 1;
            d[x * 2] = s[cbX * 2];
            d[x * 2 + 1] = s[crX * 2 + 1];
        }
    }
}

/** Luma copied, with every fourth row pair dropped to a darker level. */
- (void)scanlines:(const uint8_t *)src srcStride:(size_t)srcStride
              dst:(uint8_t *)dst dstStride:(size_t)dstStride
            width:(size_t)width rows:(size_t)rows {
    for (size_t y = 0; y < rows; y++) {
        const uint8_t *s = src + y * srcStride;
        uint8_t *d = dst + y * dstStride;
        if (y % 4 < 2) {
            for (size_t x = 0; x < width; x++) d[x] = (uint8_t)((int)s[x] * 72 / 100);
        } else {
            memcpy(d, s, width);
        }
    }
}

/**
 * Nearest-neighbour mosaic. One source sample fills a block, and the first row
 * of each block is then memcpy'd down the rest of it — so the cost is a handful
 * of reads plus a copy per row, not a sample per pixel.
 *
 * `unit` is the bytes per sample: 1 for luma, 2 for an interleaved chroma pair.
 */
- (void)mosaicPlane:(const uint8_t *)src srcStride:(size_t)srcStride
                dst:(uint8_t *)dst dstStride:(size_t)dstStride
              width:(size_t)width rows:(size_t)rows block:(size_t)block unit:(size_t)unit {
    for (size_t y = 0; y < rows; y += block) {
        size_t sampleRow = y + block / 2;
        if (sampleRow > rows - 1) sampleRow = rows - 1;
        const uint8_t *s = src + sampleRow * srcStride;
        uint8_t *first = dst + y * dstStride;

        for (size_t x = 0; x < width; x += block) {
            size_t sampleX = x + block / 2;
            if (sampleX > width - 1) sampleX = width - 1;
            size_t end = x + block;
            if (end > width) end = width;
            for (size_t i = x; i < end; i++) {
                for (size_t b = 0; b < unit; b++) first[i * unit + b] = s[sampleX * unit + b];
            }
        }

        size_t lastRow = y + block;
        if (lastRow > rows) lastRow = rows;
        for (size_t yy = y + 1; yy < lastRow; yy++) {
            memcpy(dst + yy * dstStride, first, width * unit);
        }
    }
}

@end

#pragma mark - Factory

@implementation DHBVideoLooks

+ (void)registerAll {
    // Wrapped whole: this runs on the launch path, and a look that cannot be
    // registered must cost the creator a filter, never the app.
    @try {
        NSArray<NSString *> *looks = @[
            kLookSoft, kLookMono, kLookNoir, kLookWarm,
            kLookCool, kLookVivid, kLookNeon, kLookVHS, kLookPixelate
        ];
        for (NSString *look in looks) {
            [ProcessorProvider addProcessor:[[DHBLookProcessor alloc] initWithLook:look] forName:look];
        }
    } @catch (NSException *exception) {
        NSLog(@"[DHBVideoLooks] could not register camera looks: %@", exception);
    }
}

@end
