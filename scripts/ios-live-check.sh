#!/usr/bin/env bash
# Opens a stream that is live right now on a booted iPhone simulator, in
# System Light and in System, and keeps screenshots and the app log.
#
#   scripts/ios-live-check.sh <simulator udid> <path to .app> <output dir>
set -uo pipefail

UDID="$1"
APP="$2"
OUT="$3"
WORK="${RUNNER_TEMP:-/tmp}/ios-live"
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
EXE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$APP/Info.plist")"
HERMESC="$PWD/node_modules/hermes-compiler/hermesc/osx-bin/hermesc"
[ -x "$HERMESC" ] || HERMESC="$PWD/node_modules/react-native/sdks/hermesc/osx-bin/hermesc"

mkdir -p "$OUT/live" "$OUT/logs" "$WORK/app"

npx patch-package --error-on-fail > "$OUT/logs/patch-package.log" 2>&1 || { cat "$OUT/logs/patch-package.log"; exit 1; }
cp index.ts "$WORK/index.ts.orig"
printf '\nimport "./scripts/ios-live/tour";\n' >> index.ts
ENTRY="$(node -e "require('expo/scripts/resolveAppEntry')" "$PWD" ios absolute | tail -n 1)"
cat > "$WORK/bundle.sh" <<EOF
set -euo pipefail
npx expo export:embed --platform ios --dev false --minify false --entry-file "$ENTRY" \
  --bundle-output "$WORK/main.js" --assets-dest "$WORK/app"
EOF
eas env:exec production "bash $WORK/bundle.sh" > "$OUT/logs/bundle.log" 2>&1
STATUS=$?
cp "$WORK/index.ts.orig" index.ts
if [ "$STATUS" != 0 ] || [ ! -s "$WORK/main.js" ]; then echo "Bundling failed"; tail -40 "$OUT/logs/bundle.log"; exit 1; fi
"$HERMESC" -emit-binary -O -out "$WORK/app/main.jsbundle" "$WORK/main.js" 2>> "$OUT/logs/bundle.log" || { echo "hermesc failed"; tail -20 "$OUT/logs/bundle.log"; exit 1; }

cp -R "$WORK/app/." "$APP/"
codesign --force --sign - --preserve-metadata=entitlements "$APP" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"

xcrun simctl spawn "$UDID" log stream --style compact --level info \
  --predicate "process == \"$EXE\"" > "$OUT/logs/app.log" 2>&1 &
LOG_PID=$!
trap 'kill "$LOG_PID" 2>/dev/null' EXIT

storage() {
  local data dir
  data="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)"
  dir="$data/Library/Application Support/$BUNDLE/RCTAsyncLocalStorage_V1"
  mkdir -p "$dir"
  python3 - "$dir/manifest.json" "$@" <<'PY'
import json, os, sys
path, args = sys.argv[1], sys.argv[2:]
manifest = {}
if os.path.exists(path):
    try:
        manifest = json.load(open(path))
    except Exception:
        manifest = {}
for key, value in zip(args[0::2], args[1::2]):
    if value == "-":
        manifest.pop(key, None)
    else:
        manifest[key] = value
json.dump(manifest, open(path, "w"))
PY
}

for theme in system-light; do
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  [ "$theme" = system-light ] && xcrun simctl ui "$UDID" appearance light || xcrun simctl ui "$UDID" appearance dark
  storage dehub.theme "$theme" dehub.liveCheck 1 dehub.liveCheck.runs - crash-recovery-restarts-durable-v1 -
  echo "=== $theme ===" >> "$OUT/logs/app.log"
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  for i in $(seq -w 1 45); do
    sleep 1.5
    xcrun simctl io "$UDID" screenshot --type=jpeg "$OUT/live/$theme-$i.jpg" >/dev/null 2>&1 || true
  done
  xcrun simctl launchctl list 2>/dev/null | grep -q "UIKitApplication:$BUNDLE" || echo "$theme: app not running at the end" >> "$OUT/live/notes.txt"
done

sleep 2
kill "$LOG_PID" 2>/dev/null
cp ~/Library/Logs/DiagnosticReports/"$EXE"*.ips "$OUT/logs/" 2>/dev/null || true
grep -n -A30 -E '\[live-check\]|\[FatalJS\]|\[UncaughtJS\]|\[restartApp\]|\[warn\] \[restartApp\]' "$OUT/logs/app.log" | cut -c1-600 | head -700 > "$OUT/live/faults.txt" || true
grep -E '\[live-check\]|=== ' "$OUT/logs/app.log" | cut -c1-400
echo "JS restarts: $(grep -c 'state = restarting' "$OUT/logs/app.log")"
