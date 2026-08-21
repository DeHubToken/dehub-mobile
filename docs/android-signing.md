# Android release signing

## The problem this replaced

Up to and including v1.14.1, `signingConfigs.release` did not exist and the
`release` build type pointed at `signingConfigs.debug` — the stock React Native
`debug.keystore` that is committed at `android/app/debug.keystore`.

The APK published at dehub.io/apk was therefore signed with:

```
CN=Android Debug, OU=Android, O=Unknown, L=Unknown, ST=Unknown, C=US
SHA-256 FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
SHA-1   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

That keystore ships in every React Native project in existence, with public
credentials (`android` / `androiddebugkey` / `android`). Two consequences:

1. Anyone can build an APK with `applicationId io.dehub.mobile` signed with the
   same key, and Android will accept it as an **update** to an installed DeHub
   app, inheriting its data.
2. It blocks Android App Links. `dehub.io/.well-known/assetlinks.json` has to
   list the app's signing SHA-256; publishing this fingerprint would let any
   such forged build verify as the handler for every dehub.io link, including
   OAuth and magic-link returns.

## How it works now

`android/app/build.gradle` reads four values, each from a Gradle property or
the identically named environment variable:

| Name | Meaning |
| --- | --- |
| `DEHUB_UPLOAD_STORE_FILE` | path to the keystore (absolute, or relative to `android/app`) |
| `DEHUB_UPLOAD_STORE_PASSWORD` | keystore password |
| `DEHUB_UPLOAD_KEY_ALIAS` | key alias |
| `DEHUB_UPLOAD_KEY_PASSWORD` | key password |

If all four are present, release builds use them. If any is missing, a
`gradle.taskGraph` guard **fails** any `assemble*Release` / `bundle*Release` /
`package*Release` task rather than quietly falling back to the debug key.
Builds running under EAS (`EAS_BUILD=true`) are exempt, because EAS injects its
own credentials.

Nothing secret is committed. The keystore and its passwords live outside the
repo.

## Setting it up on a release machine

Generate the keystore once, and back it up somewhere durable — losing it means
losing the ability to update sideloaded installs:

```bash
keytool -genkeypair -v -keystore dehub-release.keystore -alias dehub -keyalg RSA -keysize 4096 -validity 10000
```

Then put the values in `~/.gradle/gradle.properties` (never in the repo):

```properties
DEHUB_UPLOAD_STORE_FILE=/absolute/path/to/dehub-release.keystore
DEHUB_UPLOAD_STORE_PASSWORD=…
DEHUB_UPLOAD_KEY_ALIAS=dehub
DEHUB_UPLOAD_KEY_PASSWORD=…
```

Read back the fingerprint you will need for assetlinks:

```bash
keytool -list -v -keystore dehub-release.keystore -alias dehub | grep SHA256
```

Alternatively, skip local keystores entirely and let EAS manage Android
credentials (`eas credentials -p android`); the guard already exempts EAS
builds.

## Cutover cost

A re-keyed APK **cannot install over an existing sideloaded one** — Android
rejects the signature mismatch. Anyone who sideloaded a build up to v1.14.1
must uninstall and reinstall. Play-installed users are unaffected, because Play
re-signs with its own App Signing key.

## App Links follow-up

Once the release key exists, `dehubweb` needs
`public/.well-known/assetlinks.json` with **both** fingerprints:

* the Play App Signing key — Play Console → Test and release → Setup → App
  integrity → App signing key certificate;
* the new upload/release key generated above.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "io.dehub.mobile",
      "sha256_cert_fingerprints": ["<play app signing>", "<upload key>"]
    }
  }
]
```

The serving path already works (dehubweb #393 added the plumbing and
deliberately left the file out until a real key existed). Verify with:

```bash
curl -i https://dehub.io/.well-known/assetlinks.json
```

which should return `200` with `application/json`, and then:

```bash
adb shell pm get-app-links io.dehub.mobile
```

which should report `dehub.io` as verified.
