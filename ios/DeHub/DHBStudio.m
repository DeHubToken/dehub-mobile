//
//  DHBStudio.m
//
//  The iOS counterpart to android/.../studio/. Same two processors, same
//  module surface, same maths, so a broadcast looks the same from either
//  phone. Read DHBVideoLooks.m first: the two rules at the top of it hold here
//  too — never return nil from a processor (return the frame you were given),
//  and never write into the camera's buffer.
//
//  What differs from Android:
//
//  - Pixels are NV12 (one interleaved CbCr plane), and the camera may deliver
//    full-range or video-range YUV. Pictures are converted for whichever range
//    the frames are in, so a card's black is the camera's black.
//  - Segmentation is Vision's VNGeneratePersonSegmentationRequest at balanced
//    quality, iOS 15+. On anything older the background step passes frames
//    through untouched.
//
//  Every picture arrives upright (as a viewer sees the frame) and is
//  re-laid-out once, off the capture thread, into the buffer's own geometry —
//  rotation included — so the per-frame work is a straight row blend. WebRTC
//  hands processors the frame as viewers will see it once rotated, so nothing
//  here needs to know which camera is in use.
//

#import "DHBStudio.h"

#import "ProcessorProvider.h"
#import "VideoFrameProcessor.h"

#import <React/RCTBridgeModule.h>

#import <CoreVideo/CoreVideo.h>
#import <UIKit/UIKit.h>
#import <Vision/Vision.h>
#import <stdatomic.h>

#import <WebRTC/RTCCVPixelBuffer.h>
#import <WebRTC/RTCVideoFrame.h>
#import <WebRTC/RTCVideoFrameBuffer.h>

static NSString *const kProcessorBackground = @"dhb-background";
static NSString *const kProcessorStudio = @"dhb-studio";

/** Bump with libs/phoneStudio.ts when the JS contract changes. */
static const NSInteger kStudioVersion = 1;

/** How long a scene card takes to fade in or out. */
static const double kCardFadeSeconds = 0.3;

/** The blur grid is the frame at 1/8 luma resolution (1/4 chroma), blurred again. */
static const int kGrid = 8;

typedef NS_ENUM(NSInteger, DHBBackgroundMode) {
    DHBBackgroundModeNone = 0,
    DHBBackgroundModeBlur,
    DHBBackgroundModeColor,
    DHBBackgroundModeImage,
};

static inline int DHBClampByte(int v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

#pragma mark - Geometry

/** The shape of the frames being processed. Value type; compared field by field. */
typedef struct {
    int width;
    int height;
    int rotation;   // 0, 90, 180, 270 — clockwise to display
    BOOL fullRange;
} DHBGeometry;

static inline BOOL DHBGeometryEqual(DHBGeometry a, DHBGeometry b) {
    return a.width == b.width && a.height == b.height && a.rotation == b.rotation && a.fullRange == b.fullRange;
}
static inline BOOL DHBGeometrySwapped(DHBGeometry g) { return g.rotation % 180 != 0; }
static inline int DHBUprightWidth(DHBGeometry g) { return DHBGeometrySwapped(g) ? g.height : g.width; }
static inline int DHBUprightHeight(DHBGeometry g) { return DHBGeometrySwapped(g) ? g.width : g.height; }
static inline int DHBChromaWidth(DHBGeometry g) { return (g.width + 1) / 2; }
static inline int DHBChromaHeight(DHBGeometry g) { return (g.height + 1) / 2; }

static int DHBRotationDegrees(RTCVideoRotation rotation) {
    switch (rotation) {
        case RTCVideoRotation_90: return 90;
        case RTCVideoRotation_180: return 180;
        case RTCVideoRotation_270: return 270;
        default: return 0;
    }
}

#pragma mark - Colour

/** RGB (premultiplied by `a`) to premultiplied Y/Cb/Cr, BT.601, in the frame's range. */
static inline void DHBRGBToYUV(int r, int g, int b, int a, BOOL fullRange, int *y, int *u, int *v) {
    if (fullRange) {
        *y = DHBClampByte((77 * r + 150 * g + 29 * b + 128) >> 8);
        *u = DHBClampByte(((-43 * r - 85 * g + 128 * b + 128) >> 8) + (128 * a + 127) / 255);
        *v = DHBClampByte(((128 * r - 107 * g - 21 * b + 128) >> 8) + (128 * a + 127) / 255);
    } else {
        *y = DHBClampByte(((66 * r + 129 * g + 25 * b + 128) >> 8) + (16 * a + 127) / 255);
        *u = DHBClampByte(((-38 * r - 74 * g + 112 * b + 128) >> 8) + (128 * a + 127) / 255);
        *v = DHBClampByte(((112 * r - 94 * g - 18 * b + 128) >> 8) + (128 * a + 127) / 255);
    }
}

static void DHBHexToRGB(NSString *hex, int *r, int *g, int *b) {
    unsigned int value = 0x0b0b0f;
    NSString *clean = [[hex ?: @"" stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet]
        stringByReplacingOccurrencesOfString:@"#" withString:@""];
    if (clean.length == 6) {
        char *end = NULL;
        const char *digits = clean.UTF8String;
        unsigned long parsed = strtoul(digits, &end, 16);
        if (end != NULL && end != digits && *end == '\0') value = (unsigned int)parsed;
    }
    *r = (value >> 16) & 0xFF;
    *g = (value >> 8) & 0xFF;
    *b = value & 0xFF;
}

#pragma mark - Pictures

/** An upright picture, decoded once to premultiplied RGBA. */
@interface DHBPicture : NSObject
@property (nonatomic, readonly) int width;
@property (nonatomic, readonly) int height;
@property (nonatomic, readonly) NSData *rgba;
+ (nullable instancetype)pictureAtPath:(NSString *)path opaque:(BOOL)opaque;
@end

@implementation DHBPicture

- (instancetype)initWithWidth:(int)width height:(int)height rgba:(NSData *)rgba {
    self = [super init];
    if (self) {
        _width = width;
        _height = height;
        _rgba = rgba;
    }
    return self;
}

+ (instancetype)pictureAtPath:(NSString *)path opaque:(BOOL)opaque {
    NSString *file = path;
    if ([path hasPrefix:@"file://"]) file = [NSURL URLWithString:path].path ?: path;
    UIImage *image = [UIImage imageWithContentsOfFile:file];
    CGImageRef cg = image.CGImage;
    if (cg == NULL) return nil;

    // A gallery photo can be 4000px; nothing here needs more than this.
    size_t w = CGImageGetWidth(cg);
    size_t h = CGImageGetHeight(cg);
    const size_t maxSide = 2048;
    if (w == 0 || h == 0) return nil;
    double scale = MIN(1.0, (double)maxSide / (double)MAX(w, h));
    size_t outW = MAX((size_t)1, (size_t)lround(w * scale));
    size_t outH = MAX((size_t)1, (size_t)lround(h * scale));

    NSMutableData *data = [NSMutableData dataWithLength:outW * outH * 4];
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGContextRef ctx = CGBitmapContextCreate(data.mutableBytes, outW, outH, 8, outW * 4, space,
                                             kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(space);
    if (ctx == NULL) return nil;
    if (opaque) {
        CGContextSetRGBFillColor(ctx, 0, 0, 0, 1);
        CGContextFillRect(ctx, CGRectMake(0, 0, outW, outH));
    }
    CGContextSetInterpolationQuality(ctx, kCGInterpolationHigh);
    // UIImage applies EXIF orientation when drawn; CGImage does not, so a
    // camera-roll picture is drawn through UIKit to come out the right way up.
    UIGraphicsPushContext(ctx);
    CGContextTranslateCTM(ctx, 0, outH);
    CGContextScaleCTM(ctx, 1, -1);
    [image drawInRect:CGRectMake(0, 0, outW, outH)];
    UIGraphicsPopContext();
    CGContextRelease(ctx);
    return [[DHBPicture alloc] initWithWidth:(int)outW height:(int)outH rgba:data];
}

@end

/**
 * Where each buffer pixel samples from in an upright source picture. For every
 * rotation the source column depends on one buffer axis and the source row on
 * the other, so two tables cover the frame.
 */
typedef struct {
    int *a;      // indexed by buffer column
    int *b;      // indexed by buffer row
    BOOL swapped; // when set, b gives the source column and a the source row
} DHBSampler;

static DHBSampler DHBSamplerMake(DHBGeometry g, int sourceW, int sourceH, BOOL cover) {
    int uw = DHBUprightWidth(g);
    int uh = DHBUprightHeight(g);
    double sx = (double)sourceW / uw;
    double sy = (double)sourceH / uh;
    double ox = 0, oy = 0;
    if (cover) {
        double s = MIN(sx, sy);
        ox = (sourceW - uw * s) / 2.0;
        oy = (sourceH - uh * s) / 2.0;
        sx = s;
        sy = s;
    }
    int *mapX = malloc(sizeof(int) * uw);
    int *mapY = malloc(sizeof(int) * uh);
    for (int u = 0; u < uw; u++) mapX[u] = MIN(MAX((int)((u + 0.5) * sx + ox), 0), sourceW - 1);
    for (int u = 0; u < uh; u++) mapY[u] = MIN(MAX((int)((u + 0.5) * sy + oy), 0), sourceH - 1);

    DHBSampler s = { malloc(sizeof(int) * g.width), malloc(sizeof(int) * g.height), DHBGeometrySwapped(g) };
    int w = g.width, h = g.height;
    switch (g.rotation) {
        case 90:
            for (int x = 0; x < w; x++) s.a[x] = mapY[x];
            for (int y = 0; y < h; y++) s.b[y] = mapX[h - 1 - y];
            break;
        case 180:
            for (int x = 0; x < w; x++) s.a[x] = mapX[w - 1 - x];
            for (int y = 0; y < h; y++) s.b[y] = mapY[h - 1 - y];
            break;
        case 270:
            for (int x = 0; x < w; x++) s.a[x] = mapY[w - 1 - x];
            for (int y = 0; y < h; y++) s.b[y] = mapX[y];
            break;
        default:
            for (int x = 0; x < w; x++) s.a[x] = mapX[x];
            for (int y = 0; y < h; y++) s.b[y] = mapY[y];
            break;
    }
    free(mapX);
    free(mapY);
    return s;
}

static inline int DHBSampleX(DHBSampler *s, int x, int y) { return s->swapped ? s->b[y] : s->a[x]; }
static inline int DHBSampleY(DHBSampler *s, int x, int y) { return s->swapped ? s->a[x] : s->b[y]; }
static void DHBSamplerFree(DHBSampler s) { free(s.a); free(s.b); }

/**
 * A picture laid out like the frame: Y plane, interleaved CbCr plane, and —
 * for translucent pictures — per-pixel alpha with colour premultiplied, plus
 * each row's first/last covered column so empty rows cost nothing.
 */
@interface DHBLayer : NSObject
@property (nonatomic, readonly) DHBGeometry geometry;
@property (nonatomic, readonly) BOOL hasAlpha;
@property (nonatomic, readonly) NSData *y;
@property (nonatomic, readonly) NSData *uv;
@property (nonatomic, readonly) NSData *alpha;       // luma resolution
@property (nonatomic, readonly) NSData *chromaAlpha; // chroma resolution
@property (nonatomic, readonly) NSData *spans;       // int32 pairs per luma row
@property (nonatomic, readonly) NSData *chromaSpans; // int32 pairs per chroma row
+ (instancetype)layerWithPicture:(DHBPicture *)picture geometry:(DHBGeometry)g alpha:(BOOL)alpha cover:(BOOL)cover;
@end

@implementation DHBLayer

+ (instancetype)layerWithPicture:(DHBPicture *)picture geometry:(DHBGeometry)g alpha:(BOOL)withAlpha cover:(BOOL)cover {
    DHBLayer *layer = [DHBLayer new];
    layer->_geometry = g;
    layer->_hasAlpha = withAlpha;
    int w = g.width, h = g.height, cw = DHBChromaWidth(g), ch = DHBChromaHeight(g);
    DHBSampler s = DHBSamplerMake(g, picture.width, picture.height, cover);
    const uint8_t *px = picture.rgba.bytes;
    int sw = picture.width;

    NSMutableData *y = [NSMutableData dataWithLength:(NSUInteger)w * h];
    NSMutableData *uv = [NSMutableData dataWithLength:(NSUInteger)cw * ch * 2];
    NSMutableData *alpha = withAlpha ? [NSMutableData dataWithLength:(NSUInteger)w * h] : nil;
    NSMutableData *calpha = withAlpha ? [NSMutableData dataWithLength:(NSUInteger)cw * ch] : nil;
    NSMutableData *spans = withAlpha ? [NSMutableData dataWithLength:sizeof(int32_t) * h * 2] : nil;
    NSMutableData *cspans = withAlpha ? [NSMutableData dataWithLength:sizeof(int32_t) * ch * 2] : nil;
    uint8_t *yp = y.mutableBytes, *uvp = uv.mutableBytes;
    uint8_t *ap = alpha.mutableBytes, *cap = calpha.mutableBytes;
    int32_t *sp = spans.mutableBytes, *csp = cspans.mutableBytes;

    for (int yy = 0; yy < h; yy++) {
        int first = -1, last = -1;
        for (int x = 0; x < w; x++) {
            const uint8_t *p = px + ((size_t)DHBSampleY(&s, x, yy) * sw + DHBSampleX(&s, x, yy)) * 4;
            int a = withAlpha ? p[3] : 255;
            if (a == 0) continue;
            int Y, U, V;
            DHBRGBToYUV(p[0], p[1], p[2], a, g.fullRange, &Y, &U, &V);
            yp[(size_t)yy * w + x] = (uint8_t)Y;
            if (withAlpha) {
                ap[(size_t)yy * w + x] = (uint8_t)a;
                if (first < 0) first = x;
                last = x;
            }
        }
        if (withAlpha) {
            sp[yy * 2] = first < 0 ? 0 : first;
            sp[yy * 2 + 1] = first < 0 ? 0 : last + 1;
        }
    }
    for (int cy = 0; cy < ch; cy++) {
        int ly = MIN(cy * 2, h - 1);
        int first = -1, last = -1;
        for (int cx = 0; cx < cw; cx++) {
            int lx = MIN(cx * 2, w - 1);
            const uint8_t *p = px + ((size_t)DHBSampleY(&s, lx, ly) * sw + DHBSampleX(&s, lx, ly)) * 4;
            int a = withAlpha ? p[3] : 255;
            if (a == 0) continue;
            int Y, U, V;
            DHBRGBToYUV(p[0], p[1], p[2], a, g.fullRange, &Y, &U, &V);
            uvp[((size_t)cy * cw + cx) * 2] = (uint8_t)U;
            uvp[((size_t)cy * cw + cx) * 2 + 1] = (uint8_t)V;
            if (withAlpha) {
                cap[(size_t)cy * cw + cx] = (uint8_t)a;
                if (first < 0) first = cx;
                last = cx;
            }
        }
        if (withAlpha) {
            csp[cy * 2] = first < 0 ? 0 : first;
            csp[cy * 2 + 1] = first < 0 ? 0 : last + 1;
        }
    }
    DHBSamplerFree(s);
    layer->_y = y;
    layer->_uv = uv;
    layer->_alpha = alpha;
    layer->_chromaAlpha = calpha;
    layer->_spans = spans;
    layer->_chromaSpans = cspans;
    return layer;
}

@end

/** A person mask laid out like the frame. 255 is the person. */
@interface DHBMask : NSObject
@property (nonatomic, readonly) DHBGeometry geometry;
@property (nonatomic, readonly) NSData *luma;
@property (nonatomic, readonly) NSData *chroma;
@end

@implementation DHBMask
- (instancetype)initWithGeometry:(DHBGeometry)g luma:(NSData *)luma chroma:(NSData *)chroma {
    self = [super init];
    if (self) {
        _geometry = g;
        _luma = luma;
        _chroma = chroma;
    }
    return self;
}
@end

#pragma mark - State

/**
 * Everything the processors read. Properties are atomic object swaps of
 * immutable layers, so the capture thread never waits and never sees half a
 * picture. Slow work runs on `layoutQueue` or the module's own queue.
 */
@interface DHBStudioState : NSObject
@property (atomic, strong) DHBPicture *overlaySource;
@property (atomic, strong) DHBPicture *cardSource;
@property (atomic, strong) DHBPicture *backgroundSource;
@property (atomic, strong) DHBLayer *overlay;
@property (atomic, strong) DHBLayer *card;
@property (atomic, strong) DHBLayer *previousCard;
@property (atomic, assign) CFTimeInterval cardChangedAt;
@property (atomic, strong) DHBLayer *backgroundImage;
@property (atomic, assign) DHBBackgroundMode backgroundMode;
@property (atomic, copy) NSString *backgroundColor;
@property (atomic, strong) DHBMask *mask;
@property (atomic, strong) NSValue *geometryValue;
@property (nonatomic, readonly) dispatch_queue_t layoutQueue;
+ (instancetype)shared;
@end

@implementation DHBStudioState {
    atomic_bool _relayoutQueued;
}

+ (instancetype)shared {
    static DHBStudioState *state;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ state = [DHBStudioState new]; });
    return state;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _layoutQueue = dispatch_queue_create("io.dehub.studio.layout", DISPATCH_QUEUE_SERIAL);
        atomic_init(&_relayoutQueued, false);
        self.backgroundColor = @"#0b0b0f";
    }
    return self;
}

- (BOOL)geometry:(DHBGeometry *)out {
    NSValue *v = self.geometryValue;
    if (v == nil) return NO;
    [v getValue:out];
    return YES;
}

/** Fade progress 0 (previous) … 256 (current). */
- (int)cardProgress {
    double t = (CACurrentMediaTime() - self.cardChangedAt) / kCardFadeSeconds;
    t = MIN(1.0, MAX(0.0, t));
    double eased = t * t * (3 - 2 * t);
    return (int)(eased * 256);
}

- (void)noteGeometry:(DHBGeometry)g {
    DHBGeometry current;
    if ([self geometry:&current] && DHBGeometryEqual(current, g)) return;
    self.geometryValue = [NSValue valueWithBytes:&g objCType:@encode(DHBGeometry)];
    bool expected = false;
    if (!atomic_compare_exchange_strong(&_relayoutQueued, &expected, true)) return;
    dispatch_async(self.layoutQueue, ^{
        atomic_store(&self->_relayoutQueued, false);
        [self relayout];
    });
}

- (void)relayout {
    DHBGeometry g;
    if (![self geometry:&g]) return;
    @try {
        DHBPicture *overlay = self.overlaySource;
        if (overlay && !(self.overlay && DHBGeometryEqual(self.overlay.geometry, g))) {
            self.overlay = [DHBLayer layerWithPicture:overlay geometry:g alpha:YES cover:NO];
        }
        DHBPicture *card = self.cardSource;
        if (card && !(self.card && DHBGeometryEqual(self.card.geometry, g))) {
            // A relayout is not a scene change: no fade, and a stale previous
            // card is dropped rather than drawn at the wrong size.
            self.previousCard = nil;
            self.card = [DHBLayer layerWithPicture:card geometry:g alpha:NO cover:NO];
            self.cardChangedAt = 0;
        }
        DHBPicture *bg = self.backgroundSource;
        if (bg && !(self.backgroundImage && DHBGeometryEqual(self.backgroundImage.geometry, g))) {
            self.backgroundImage = [DHBLayer layerWithPicture:bg geometry:g alpha:NO cover:YES];
        }
    } @catch (NSException *e) {
        NSLog(@"[DHBStudio] relayout failed: %@", e);
    }
}

@end

#pragma mark - Processor base

/** Pool management and the lock/allocate/wrap dance, shared by both processors. */
@interface DHBStudioProcessor : NSObject <VideoFrameProcessorDelegate>
@end

@implementation DHBStudioProcessor {
    CVPixelBufferPoolRef _pool;
    size_t _poolWidth;
    size_t _poolHeight;
    OSType _poolFormat;
}

- (void)dealloc {
    if (_pool) CVPixelBufferPoolRelease(_pool);
}

- (BOOL)wanted { return NO; }

/** Subclasses fill `dst` from `src`; NO means nothing to do and the frame passes through. */
- (BOOL)renderFrom:(CVPixelBufferRef)src to:(CVPixelBufferRef)dst geometry:(DHBGeometry)g { return NO; }

/** Called before any work with the source buffer still unlocked. */
- (void)prepareWithSource:(CVPixelBufferRef)src geometry:(DHBGeometry)g {}

- (BOOL)ensurePoolForWidth:(size_t)width height:(size_t)height format:(OSType)format {
    if (_pool && _poolWidth == width && _poolHeight == height && _poolFormat == format) return YES;
    if (_pool) {
        CVPixelBufferPoolRelease(_pool);
        _pool = NULL;
    }
    NSDictionary *poolAttributes = @{ (id)kCVPixelBufferPoolMinimumBufferCountKey : @(3) };
    NSDictionary *bufferAttributes = @{
        (id)kCVPixelBufferPixelFormatTypeKey : @(format),
        (id)kCVPixelBufferWidthKey : @(width),
        (id)kCVPixelBufferHeightKey : @(height),
        (id)kCVPixelBufferIOSurfacePropertiesKey : @{},
    };
    if (CVPixelBufferPoolCreate(kCFAllocatorDefault, (__bridge CFDictionaryRef)poolAttributes,
                                (__bridge CFDictionaryRef)bufferAttributes, &_pool) != kCVReturnSuccess) {
        _pool = NULL;
        return NO;
    }
    _poolWidth = width;
    _poolHeight = height;
    _poolFormat = format;
    return YES;
}

- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer didCaptureVideoFrame:(RTCVideoFrame *)frame {
    if (frame == nil || ![self wanted]) return frame;
    if (![frame.buffer isKindOfClass:[RTCCVPixelBuffer class]]) return frame;
    RTCCVPixelBuffer *source = (RTCCVPixelBuffer *)frame.buffer;
    CVPixelBufferRef sourceBuffer = source.pixelBuffer;
    if (sourceBuffer == NULL) return frame;

    OSType format = CVPixelBufferGetPixelFormatType(sourceBuffer);
    BOOL fullRange = format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange;
    if (!fullRange && format != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange) return frame;

    size_t width = CVPixelBufferGetWidth(sourceBuffer);
    size_t height = CVPixelBufferGetHeight(sourceBuffer);
    if (width < 2 || height < 2) return frame;
    if ((size_t)source.width != width || (size_t)source.height != height) return frame;

    DHBGeometry g = { (int)width, (int)height, DHBRotationDegrees(frame.rotation), fullRange };
    DHBStudioState *state = [DHBStudioState shared];
    [state noteGeometry:g];
    [self prepareWithSource:sourceBuffer geometry:g];

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

    BOOL rendered = NO;
    @try {
        rendered = [self renderFrom:sourceBuffer to:destination geometry:g];
    } @catch (NSException *e) {
        NSLog(@"[DHBStudio] %@ failed on a frame: %@", NSStringFromClass([self class]), e);
        rendered = NO;
    }

    CVPixelBufferUnlockBaseAddress(destination, 0);
    CVPixelBufferUnlockBaseAddress(sourceBuffer, kCVPixelBufferLock_ReadOnly);

    if (!rendered) {
        CVPixelBufferRelease(destination);
        return frame;
    }
    RTCCVPixelBuffer *wrapped = [[RTCCVPixelBuffer alloc] initWithPixelBuffer:destination];
    CVPixelBufferRelease(destination);
    if (wrapped == nil) return frame;
    return [[RTCVideoFrame alloc] initWithBuffer:wrapped rotation:frame.rotation timeStampNs:frame.timeStampNs];
}

@end

typedef struct {
    uint8_t *y;
    uint8_t *uv;
    size_t yStride;
    size_t uvStride;
} DHBPlanes;

static DHBPlanes DHBPlanesOf(CVPixelBufferRef buffer) {
    DHBPlanes p = {
        (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
        (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(buffer, 1),
        CVPixelBufferGetBytesPerRowOfPlane(buffer, 0),
        CVPixelBufferGetBytesPerRowOfPlane(buffer, 1),
    };
    return p;
}

#pragma mark - dhb-studio

@interface DHBCardOverlayProcessor : DHBStudioProcessor
@end

@implementation DHBCardOverlayProcessor

- (BOOL)wanted {
    DHBStudioState *s = [DHBStudioState shared];
    return s.overlay != nil || s.card != nil || s.previousCard != nil || s.geometryValue == nil;
}

- (BOOL)renderFrom:(CVPixelBufferRef)srcBuffer to:(CVPixelBufferRef)dstBuffer geometry:(DHBGeometry)g {
    DHBStudioState *state = [DHBStudioState shared];
    DHBLayer *overlay = state.overlay;
    DHBLayer *current = state.card;
    DHBLayer *previous = state.previousCard;
    if (overlay && !DHBGeometryEqual(overlay.geometry, g)) overlay = nil;
    if (current && !DHBGeometryEqual(current.geometry, g)) current = nil;
    if (previous && !DHBGeometryEqual(previous.geometry, g)) previous = nil;
    if (!overlay && !current && !previous) return NO;

    DHBPlanes src = DHBPlanesOf(srcBuffer);
    DHBPlanes dst = DHBPlanesOf(dstBuffer);
    if (!src.y || !src.uv || !dst.y || !dst.uv) return NO;
    int w = g.width, h = g.height, cw = DHBChromaWidth(g), ch = DHBChromaHeight(g);
    int t = (!current && !previous) ? 256 : [state cardProgress];

    if (current && t >= 256) {
        const uint8_t *cy = current.y.bytes, *cuv = current.uv.bytes;
        for (int y = 0; y < h; y++) memcpy(dst.y + y * dst.yStride, cy + (size_t)y * w, w);
        for (int y = 0; y < ch; y++) memcpy(dst.uv + y * dst.uvStride, cuv + (size_t)y * cw * 2, cw * 2);
    } else if (!current && (!previous || t >= 256)) {
        for (int y = 0; y < h; y++) memcpy(dst.y + y * dst.yStride, src.y + y * src.yStride, w);
        for (int y = 0; y < ch; y++) memcpy(dst.uv + y * dst.uvStride, src.uv + y * src.uvStride, cw * 2);
    } else {
        int inv = 256 - t;
        const uint8_t *py = previous.y.bytes, *puv = previous.uv.bytes;
        const uint8_t *qy = current.y.bytes, *quv = current.uv.bytes;
        for (int y = 0; y < h; y++) {
            const uint8_t *cam = src.y + y * src.yStride;
            uint8_t *out = dst.y + y * dst.yStride;
            for (int x = 0; x < w; x++) {
                int from = py ? py[(size_t)y * w + x] : cam[x];
                int to = qy ? qy[(size_t)y * w + x] : cam[x];
                out[x] = (uint8_t)((from * inv + to * t) >> 8);
            }
        }
        for (int y = 0; y < ch; y++) {
            const uint8_t *cam = src.uv + y * src.uvStride;
            uint8_t *out = dst.uv + y * dst.uvStride;
            for (int x = 0; x < cw * 2; x++) {
                int from = puv ? puv[(size_t)y * cw * 2 + x] : cam[x];
                int to = quv ? quv[(size_t)y * cw * 2 + x] : cam[x];
                out[x] = (uint8_t)((from * inv + to * t) >> 8);
            }
        }
    }

    if (overlay) {
        const uint8_t *oy = overlay.y.bytes, *oa = overlay.alpha.bytes;
        const uint8_t *ouv = overlay.uv.bytes, *oca = overlay.chromaAlpha.bytes;
        const int32_t *spans = overlay.spans.bytes, *cspans = overlay.chromaSpans.bytes;
        for (int y = 0; y < h; y++) {
            int start = spans[y * 2], end = spans[y * 2 + 1];
            if (end <= start) continue;
            uint8_t *out = dst.y + y * dst.yStride;
            const uint8_t *py = oy + (size_t)y * w, *pa = oa + (size_t)y * w;
            for (int x = start; x < end; x++) {
                int a = pa[x];
                if (a == 0) continue;
                out[x] = a == 255 ? py[x] : (uint8_t)MIN(255, py[x] + (out[x] * (255 - a) + 127) / 255);
            }
        }
        for (int y = 0; y < ch; y++) {
            int start = cspans[y * 2], end = cspans[y * 2 + 1];
            if (end <= start) continue;
            uint8_t *out = dst.uv + y * dst.uvStride;
            const uint8_t *puv = ouv + (size_t)y * cw * 2, *pa = oca + (size_t)y * cw;
            for (int x = start; x < end; x++) {
                int a = pa[x];
                if (a == 0) continue;
                if (a == 255) {
                    out[x * 2] = puv[x * 2];
                    out[x * 2 + 1] = puv[x * 2 + 1];
                } else {
                    out[x * 2] = (uint8_t)MIN(255, puv[x * 2] + (out[x * 2] * (255 - a) + 127) / 255);
                    out[x * 2 + 1] = (uint8_t)MIN(255, puv[x * 2 + 1] + (out[x * 2 + 1] * (255 - a) + 127) / 255);
                }
            }
        }
    }
    return YES;
}

@end

#pragma mark - dhb-background

@interface DHBBackgroundProcessor : DHBStudioProcessor
@end

@implementation DHBBackgroundProcessor {
    dispatch_queue_t _visionQueue;
    atomic_bool _busy;
    CFTimeInterval _lastStart;
    DHBBackgroundMode _mode;
    int *_gridY;
    int *_gridU;
    int *_gridV;
    int *_gridTmp;
    int _gridCount;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _visionQueue = dispatch_queue_create("io.dehub.studio.segment", DISPATCH_QUEUE_SERIAL);
        atomic_init(&_busy, false);
    }
    return self;
}

- (void)dealloc {
    free(_gridY); free(_gridU); free(_gridV); free(_gridTmp);
}

- (BOOL)wanted {
    DHBBackgroundMode next = [DHBStudioState shared].backgroundMode;
    if (next != _mode) {
        if (_mode == DHBBackgroundModeNone) [DHBStudioState shared].mask = nil;
        _mode = next;
    }
    if (next == DHBBackgroundModeNone) return NO;
    if (@available(iOS 15.0, *)) return YES;
    return NO;
}

/** Hands the frame to Vision unless a segmentation is already running. Never waits. */
- (void)prepareWithSource:(CVPixelBufferRef)src geometry:(DHBGeometry)g {
    if (@available(iOS 15.0, *)) {
        CFTimeInterval now = CACurrentMediaTime();
        if (now - _lastStart < 0.05) return;
        bool expected = false;
        if (!atomic_compare_exchange_strong(&_busy, &expected, true)) return;
        _lastStart = now;
        CVPixelBufferRetain(src);
        dispatch_async(_visionQueue, ^{
            @try {
                [self segment:src geometry:g];
            } @catch (NSException *e) {
                NSLog(@"[DHBStudio] segmentation failed: %@", e);
            }
            CVPixelBufferRelease(src);
            atomic_store(&self->_busy, false);
        });
    }
}

- (void)segment:(CVPixelBufferRef)src geometry:(DHBGeometry)g API_AVAILABLE(ios(15.0)) {
    CGImagePropertyOrientation orientation = kCGImagePropertyOrientationUp;
    switch (g.rotation) {
        case 90: orientation = kCGImagePropertyOrientationRight; break;
        case 180: orientation = kCGImagePropertyOrientationDown; break;
        case 270: orientation = kCGImagePropertyOrientationLeft; break;
        default: break;
    }
    VNGeneratePersonSegmentationRequest *request = [VNGeneratePersonSegmentationRequest new];
    request.qualityLevel = VNGeneratePersonSegmentationRequestQualityLevelBalanced;
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCVPixelBuffer:src
                                                                              orientation:orientation
                                                                                  options:@{}];
    NSError *error = nil;
    if (![handler performRequests:@[ request ] error:&error]) return;
    VNPixelBufferObservation *observation = request.results.firstObject;
    CVPixelBufferRef mask = observation.pixelBuffer;
    if (mask == NULL) return;

    if (CVPixelBufferLockBaseAddress(mask, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) return;
    int mw = (int)CVPixelBufferGetWidth(mask);
    int mh = (int)CVPixelBufferGetHeight(mask);
    size_t stride = CVPixelBufferGetBytesPerRow(mask);
    const uint8_t *base = CVPixelBufferGetBaseAddress(mask);
    if (mw <= 0 || mh <= 0 || base == NULL) {
        CVPixelBufferUnlockBaseAddress(mask, kCVPixelBufferLock_ReadOnly);
        return;
    }
    // Confidence 0.3..0.7 becomes the soft edge; anything firmer is solid.
    uint8_t *small = malloc((size_t)mw * mh);
    for (int y = 0; y < mh; y++) {
        const uint8_t *row = base + y * stride;
        for (int x = 0; x < mw; x++) small[y * mw + x] = (uint8_t)DHBClampByte((row[x] - 77) * 255 / 102);
    }
    CVPixelBufferUnlockBaseAddress(mask, kCVPixelBufferLock_ReadOnly);

    // Vision answers in the oriented (upright) picture; a quarter-turn mask
    // shaped like the raw buffer is taken to be in buffer layout instead.
    BOOL bufferLayout = g.rotation == 0 ||
        (DHBGeometrySwapped(g) && (long)mw * g.height == (long)mh * g.width && g.width != g.height);
    DHBGeometry samplerGeometry = g;
    if (bufferLayout) samplerGeometry.rotation = 0;
    DHBSampler s = DHBSamplerMake(samplerGeometry, mw, mh, NO);

    int w = g.width, h = g.height, cw = DHBChromaWidth(g), ch = DHBChromaHeight(g);
    DHBMask *previous = [DHBStudioState shared].mask;
    const uint8_t *prev = (previous && DHBGeometryEqual(previous.geometry, g)) ? previous.luma.bytes : NULL;
    NSMutableData *luma = [NSMutableData dataWithLength:(NSUInteger)w * h];
    NSMutableData *chroma = [NSMutableData dataWithLength:(NSUInteger)cw * ch];
    uint8_t *lp = luma.mutableBytes, *cp = chroma.mutableBytes;
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            int fresh = small[DHBSampleY(&s, x, y) * mw + DHBSampleX(&s, x, y)];
            size_t i = (size_t)y * w + x;
            // Blended with the last mask so hair and shoulders do not flicker.
            lp[i] = prev ? (uint8_t)((prev[i] + fresh * 3) >> 2) : (uint8_t)fresh;
        }
    }
    for (int y = 0; y < ch; y++) {
        const uint8_t *row = lp + (size_t)MIN(y * 2, h - 1) * w;
        for (int x = 0; x < cw; x++) cp[(size_t)y * cw + x] = row[MIN(x * 2, w - 1)];
    }
    DHBSamplerFree(s);
    free(small);
    [DHBStudioState shared].mask = [[DHBMask alloc] initWithGeometry:g luma:luma chroma:chroma];
}

- (BOOL)renderFrom:(CVPixelBufferRef)srcBuffer to:(CVPixelBufferRef)dstBuffer geometry:(DHBGeometry)g {
    DHBStudioState *state = [DHBStudioState shared];
    DHBMask *mask = state.mask;
    // Until the first mask lands the picture goes out as it is.
    if (!mask || !DHBGeometryEqual(mask.geometry, g)) return NO;
    DHBBackgroundMode mode = state.backgroundMode;
    DHBLayer *image = nil;
    if (mode == DHBBackgroundModeImage) {
        image = state.backgroundImage;
        if (!image || !DHBGeometryEqual(image.geometry, g)) return NO;
    }

    DHBPlanes src = DHBPlanesOf(srcBuffer);
    DHBPlanes dst = DHBPlanesOf(dstBuffer);
    if (!src.y || !src.uv || !dst.y || !dst.uv) return NO;
    int w = g.width, h = g.height, cw = DHBChromaWidth(g), ch = DHBChromaHeight(g);
    const uint8_t *ml = mask.luma.bytes, *mc = mask.chroma.bytes;

    if (mode == DHBBackgroundModeColor) {
        int r, gr, b, Y, U, V;
        DHBHexToRGB(state.backgroundColor, &r, &gr, &b);
        DHBRGBToYUV(r, gr, b, 255, g.fullRange, &Y, &U, &V);
        for (int y = 0; y < h; y++) {
            const uint8_t *s = src.y + y * src.yStride, *m = ml + (size_t)y * w;
            uint8_t *o = dst.y + y * dst.yStride;
            for (int x = 0; x < w; x++) o[x] = (uint8_t)((s[x] * m[x] + Y * (255 - m[x]) + 127) / 255);
        }
        for (int y = 0; y < ch; y++) {
            const uint8_t *s = src.uv + y * src.uvStride, *m = mc + (size_t)y * cw;
            uint8_t *o = dst.uv + y * dst.uvStride;
            for (int x = 0; x < cw; x++) {
                int a = m[x];
                o[x * 2] = (uint8_t)((s[x * 2] * a + U * (255 - a) + 127) / 255);
                o[x * 2 + 1] = (uint8_t)((s[x * 2 + 1] * a + V * (255 - a) + 127) / 255);
            }
        }
        return YES;
    }

    if (mode == DHBBackgroundModeImage) {
        const uint8_t *iy = image.y.bytes, *iuv = image.uv.bytes;
        for (int y = 0; y < h; y++) {
            const uint8_t *s = src.y + y * src.yStride, *m = ml + (size_t)y * w, *b = iy + (size_t)y * w;
            uint8_t *o = dst.y + y * dst.yStride;
            for (int x = 0; x < w; x++) o[x] = (uint8_t)((s[x] * m[x] + b[x] * (255 - m[x]) + 127) / 255);
        }
        for (int y = 0; y < ch; y++) {
            const uint8_t *s = src.uv + y * src.uvStride, *m = mc + (size_t)y * cw, *b = iuv + (size_t)y * cw * 2;
            uint8_t *o = dst.uv + y * dst.uvStride;
            for (int x = 0; x < cw * 2; x++) {
                int a = m[x / 2];
                o[x] = (uint8_t)((s[x] * a + b[x] * (255 - a) + 127) / 255);
            }
        }
        return YES;
    }

    if (mode == DHBBackgroundModeBlur) {
        int gw = (w + kGrid - 1) / kGrid, gh = (h + kGrid - 1) / kGrid;
        [self buildGridFrom:src w:w h:h cw:cw ch:ch gw:gw gh:gh];
        [self blur:src.y srcStride:src.yStride mask:ml grid:_gridY gw:gw gh:gh cell:kGrid
               dst:dst.y dstStride:dst.yStride w:w h:h unit:1 offset:0];
        [self blur:src.uv srcStride:src.uvStride mask:mc grid:_gridU gw:gw gh:gh cell:kGrid / 2
               dst:dst.uv dstStride:dst.uvStride w:cw h:ch unit:2 offset:0];
        [self blur:src.uv srcStride:src.uvStride mask:mc grid:_gridV gw:gw gh:gh cell:kGrid / 2
               dst:dst.uv dstStride:dst.uvStride w:cw h:ch unit:2 offset:1];
        return YES;
    }
    return NO;
}

- (void)buildGridFrom:(DHBPlanes)src w:(int)w h:(int)h cw:(int)cw ch:(int)ch gw:(int)gw gh:(int)gh {
    int n = gw * gh;
    if (n != _gridCount) {
        free(_gridY); free(_gridU); free(_gridV); free(_gridTmp);
        _gridY = malloc(sizeof(int) * n);
        _gridU = malloc(sizeof(int) * n);
        _gridV = malloc(sizeof(int) * n);
        _gridTmp = malloc(sizeof(int) * n);
        _gridCount = n;
    }
    for (int gy = 0; gy < gh; gy++) {
        int y0 = MIN(gy * kGrid + 2, h - 1), y1 = MIN(gy * kGrid + 6, h - 1);
        int cy0 = MIN(gy * 4 + 1, ch - 1), cy1 = MIN(gy * 4 + 3, ch - 1);
        for (int gx = 0; gx < gw; gx++) {
            int x0 = MIN(gx * kGrid + 2, w - 1), x1 = MIN(gx * kGrid + 6, w - 1);
            _gridY[gy * gw + gx] = (src.y[y0 * src.yStride + x0] + src.y[y0 * src.yStride + x1] +
                                    src.y[y1 * src.yStride + x0] + src.y[y1 * src.yStride + x1]) >> 2;
            int cx0 = MIN(gx * 4 + 1, cw - 1), cx1 = MIN(gx * 4 + 3, cw - 1);
            const uint8_t *r0 = src.uv + cy0 * src.uvStride, *r1 = src.uv + cy1 * src.uvStride;
            _gridU[gy * gw + gx] = (r0[cx0 * 2] + r0[cx1 * 2] + r1[cx0 * 2] + r1[cx1 * 2]) >> 2;
            _gridV[gy * gw + gx] = (r0[cx0 * 2 + 1] + r0[cx1 * 2 + 1] + r1[cx0 * 2 + 1] + r1[cx1 * 2 + 1]) >> 2;
        }
    }
    int *grids[3] = { _gridY, _gridU, _gridV };
    for (int i = 0; i < 3; i++) {
        [self boxBlur:grids[i] gw:gw gh:gh radius:3];
        [self boxBlur:grids[i] gw:gw gh:gh radius:3];
    }
}

/** Separable running-sum box blur with clamped edges. */
- (void)boxBlur:(int *)g gw:(int)gw gh:(int)gh radius:(int)r {
    int span = r * 2 + 1;
    int *tmp = _gridTmp;
    for (int y = 0; y < gh; y++) {
        int *row = g + y * gw;
        int sum = 0;
        for (int k = -r; k <= r; k++) sum += row[MIN(MAX(k, 0), gw - 1)];
        for (int x = 0; x < gw; x++) {
            tmp[y * gw + x] = sum / span;
            sum += row[MIN(x + r + 1, gw - 1)] - row[MAX(x - r, 0)];
        }
    }
    for (int x = 0; x < gw; x++) {
        int sum = 0;
        for (int k = -r; k <= r; k++) sum += tmp[MIN(MAX(k, 0), gh - 1) * gw + x];
        for (int y = 0; y < gh; y++) {
            g[y * gw + x] = sum / span;
            sum += tmp[MIN(y + r + 1, gh - 1) * gw + x] - tmp[MAX(y - r, 0) * gw + x];
        }
    }
}

/**
 * Blurred background sampled bilinearly from the grid, one component at a
 * time (`unit` 2 and `offset` pick Cb or Cr out of the interleaved plane).
 */
- (void)blur:(const uint8_t *)src srcStride:(size_t)srcStride mask:(const uint8_t *)mask grid:(const int *)grid
          gw:(int)gw gh:(int)gh cell:(int)cell dst:(uint8_t *)dst dstStride:(size_t)dstStride
           w:(int)w h:(int)h unit:(int)unit offset:(int)offset {
    int *line = malloc(sizeof(int) * gw);
    for (int y = 0; y < h; y++) {
        int gyf = MAX((y * 256 + 128) / cell - 128, 0);
        int gy0 = MIN(gyf >> 8, gh - 1), gy1 = MIN(gy0 + 1, gh - 1), fy = gyf & 0xFF;
        for (int gx = 0; gx < gw; gx++) {
            line[gx] = (grid[gy0 * gw + gx] * (256 - fy) + grid[gy1 * gw + gx] * fy) >> 8;
        }
        const uint8_t *s = src + y * srcStride;
        uint8_t *o = dst + y * dstStride;
        const uint8_t *m = mask + (size_t)y * w;
        for (int x = 0; x < w; x++) {
            int i = x * unit + offset;
            int a = m[x];
            if (a == 255) {
                o[i] = s[i];
                continue;
            }
            int gxf = MAX((x * 256 + 128) / cell - 128, 0);
            int gx0 = MIN(gxf >> 8, gw - 1), gx1 = MIN(gx0 + 1, gw - 1), fx = gxf & 0xFF;
            int bg = (line[gx0] * (256 - fx) + line[gx1] * fx) >> 8;
            o[i] = (uint8_t)((s[i] * a + bg * (255 - a) + 127) / 255);
        }
    }
    free(line);
}

@end

#pragma mark - Module

@interface DHBStudio () <RCTBridgeModule>
@end

@implementation DHBStudio {
    dispatch_queue_t _queue;
}

RCT_EXPORT_MODULE(DHBStudio)

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

+ (void)registerProcessors {
    @try {
        [ProcessorProvider addProcessor:[DHBBackgroundProcessor new] forName:kProcessorBackground];
        [ProcessorProvider addProcessor:[DHBCardOverlayProcessor new] forName:kProcessorStudio];
    } @catch (NSException *exception) {
        NSLog(@"[DHBStudio] could not register studio processors: %@", exception);
    }
}

- (dispatch_queue_t)methodQueue {
    // Decoding a full-frame PNG is tens of milliseconds: never on the main queue.
    if (_queue == nil) _queue = dispatch_queue_create("io.dehub.studio.module", DISPATCH_QUEUE_SERIAL);
    return _queue;
}

- (NSDictionary *)constantsToExport {
    BOOL segmentation = NO;
    if (@available(iOS 15.0, *)) segmentation = YES;
    return @{ @"version" : @(kStudioVersion), @"segmentation" : @(segmentation) };
}

RCT_EXPORT_METHOD(setBackground:(NSString *)mode
                  color:(nullable NSString *)color
                  imagePath:(nullable NSString *)imagePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    DHBStudioState *state = [DHBStudioState shared];
    DHBBackgroundMode parsed = [mode isEqualToString:@"blur"]    ? DHBBackgroundModeBlur
                             : [mode isEqualToString:@"color"]   ? DHBBackgroundModeColor
                             : [mode isEqualToString:@"image"]   ? DHBBackgroundModeImage
                                                                 : DHBBackgroundModeNone;
    DHBPicture *picture = nil;
    if (parsed == DHBBackgroundModeImage) {
        picture = imagePath.length ? [DHBPicture pictureAtPath:imagePath opaque:YES] : nil;
        if (picture == nil) {
            reject(@"E_STUDIO_IMAGE", @"Could not read the background picture", nil);
            return;
        }
    }
    state.backgroundColor = color.length ? color : @"#0b0b0f";
    state.backgroundSource = picture;
    DHBGeometry g;
    state.backgroundImage = (picture && [state geometry:&g])
        ? [DHBLayer layerWithPicture:picture geometry:g alpha:NO cover:YES] : nil;
    state.backgroundMode = parsed;
    resolve(nil);
}

RCT_EXPORT_METHOD(setOverlay:(nullable NSString *)pngPath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    DHBStudioState *state = [DHBStudioState shared];
    DHBPicture *picture = nil;
    if (pngPath.length) {
        picture = [DHBPicture pictureAtPath:pngPath opaque:NO];
        if (picture == nil) {
            reject(@"E_STUDIO_IMAGE", @"Could not read the overlay", nil);
            return;
        }
    }
    state.overlaySource = picture;
    DHBGeometry g;
    state.overlay = (picture && [state geometry:&g]) ? [DHBLayer layerWithPicture:picture geometry:g alpha:YES cover:NO] : nil;
    resolve(nil);
}

RCT_EXPORT_METHOD(setCard:(nullable NSString *)pngPath
                  fade:(BOOL)fade
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    DHBStudioState *state = [DHBStudioState shared];
    DHBPicture *picture = nil;
    if (pngPath.length) {
        picture = [DHBPicture pictureAtPath:pngPath opaque:YES];
        if (picture == nil) {
            reject(@"E_STUDIO_IMAGE", @"Could not read the card", nil);
            return;
        }
    }
    state.cardSource = picture;
    DHBGeometry g;
    DHBLayer *layer = (picture && [state geometry:&g]) ? [DHBLayer layerWithPicture:picture geometry:g alpha:NO cover:NO] : nil;
    if (fade) {
        // Fade from whatever is on screen now: the card if it has mostly faded
        // in, else what it was fading from.
        DHBLayer *showing = [state cardProgress] >= 128 ? state.card : state.previousCard;
        state.previousCard = showing;
        state.card = layer;
        state.cardChangedAt = CACurrentMediaTime();
    } else {
        // A countdown tick: new digits, same scene, and any fade carries on.
        state.card = layer;
    }
    resolve(nil);
}

RCT_EXPORT_METHOD(getFrameSize:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    DHBGeometry g;
    if (![[DHBStudioState shared] geometry:&g]) {
        resolve([NSNull null]);
        return;
    }
    resolve(@{ @"width" : @(DHBUprightWidth(g)), @"height" : @(DHBUprightHeight(g)) });
}

RCT_EXPORT_METHOD(reset:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    DHBStudioState *state = [DHBStudioState shared];
    state.overlaySource = nil;
    state.overlay = nil;
    state.cardSource = nil;
    state.card = nil;
    state.previousCard = nil;
    state.backgroundSource = nil;
    state.backgroundImage = nil;
    state.backgroundMode = DHBBackgroundModeNone;
    state.mask = nil;
    resolve(nil);
}

@end
