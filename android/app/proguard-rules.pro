# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ==============================================================================
# R8 keep rules for release minification (C1).
#
# Scope note: Agora, react-native-webrtc and Reanimated ship their own
# consumer-rules.pro (merged automatically by AGP), so the rules below for
# them are belt-and-braces. Stripe, Rive, the nitro/quick-crypto/mmkv
# (com.margelo / com.tencent.mmkv) modules and Web3Auth do NOT ship consumer
# rules, so their keeps here are load-bearing. Over-keeping a few reflective
# SDKs still lets R8 shrink the rest of the dependency surface, which is where
# the win is. Runtime-smoke-test streaming, calls, wallet signing and payments
# before shipping.
# ==============================================================================

# ── React Native / Hermes / Fabric core (New Architecture) ────────────────────
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# JS-callable native modules, view managers and their annotated members
-keepclassmembers class * extends com.facebook.react.bridge.BaseJavaModule {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}

# Enums + Parcelable (accessed reflectively at runtime)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keep class * implements android.os.Parcelable { public static final ** CREATOR; }

# ── App's own native surface ──────────────────────────────────────────────────
-keep class io.dehub.mobile.** { *; }

# ── nitro-modules / quick-crypto / react-native-mmkv / rive (Margelo/nitro JSI)
# These register JNI/HybridObjects reflectively; do not ship consumer rules.
-keep class com.margelo.** { *; }
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.margelo.**
-dontwarn com.tencent.mmkv.**

# ── Rive runtime ──────────────────────────────────────────────────────────────
-keep class app.rive.** { *; }
-dontwarn app.rive.**

# ── Stripe (no consumer rules; drives payments) ───────────────────────────────
-keep class com.reactnativestripesdk.** { *; }
-keep class com.stripe.android.** { *; }
-dontwarn com.stripe.android.**

# ── Web3Auth / Torus (no consumer rules; drives wallet signing) ───────────────
-keep class com.web3auth.** { *; }
-keep class org.torusresearch.** { *; }
-dontwarn com.web3auth.**
-dontwarn org.torusresearch.**

# ── WalletConnect / Reown AppKit ──────────────────────────────────────────────
-keep class com.walletconnect.** { *; }
-keep class com.reown.** { *; }
-dontwarn com.walletconnect.**
-dontwarn com.reown.**

# ── Agora (has consumer-rules.pro; belt-and-braces) ───────────────────────────
-keep class io.agora.** { *; }
-dontwarn io.agora.**

# ── react-native-webrtc (has consumer-rules.pro; belt-and-braces) ─────────────
-keep class org.webrtc.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn org.webrtc.**

# ── Networking stack (transitive: OkHttp/Okio/Retrofit/Conscrypt) ─────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-dontwarn org.conscrypt.**
-dontwarn javax.annotation.**

# ── Gson-style reflective model (de)serialisation, if pulled transitively ─────
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keepattributes AnnotationDefault

# Add any project specific keep options here:
