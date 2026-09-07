// Keeps android:allowNativeHeapPointerTagging="false" on <application> across
// a prebuild --clean. The committed manifest carries the attribute directly;
// this plugin exists so a regenerated manifest does too.
//
// Why: Xiaomi Android 14 devices report SIGABRT "pointer tag truncated" from
// libc's free(). With tagging off, libc neither sets nor checks the top byte
// of heap pointers, so a pointer whose tag was cleared is freed normally. No
// runtime cost; the hardware ignores those bits either way.

const { withAndroidManifest, createRunOncePlugin } = require("expo/config-plugins");

const withPointerTaggingOff = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$ = {
        ...application.$,
        "android:allowNativeHeapPointerTagging": "false",
      };
    }
    return config;
  });

module.exports = createRunOncePlugin(
  withPointerTaggingOff,
  "withPointerTaggingOff",
  "1.0.0"
);
