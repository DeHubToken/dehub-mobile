#!/usr/bin/env bash
# Walks a Release build of the app on a booted iPhone simulator: opens each
# page by deep link in light and dark, screenshots it, and notes any page
# after which the app is no longer running. Used by ios-simulator-check.yml.
#
#   scripts/ios-simulator-walk.sh <simulator udid> <path to .app> <output dir>
set -uo pipefail

UDID="$1"
APP="$2"
OUT="$3"
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
EXE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$APP/Info.plist")"

mkdir -p "$OUT/shots" "$OUT/logs"
: > "$OUT/crashes.txt"

xcrun simctl install "$UDID" "$APP"
for service in photos camera microphone location; do
  xcrun simctl privacy "$UDID" grant "$service" "$BUNDLE" >/dev/null 2>&1 || true
done

xcrun simctl spawn "$UDID" log stream --style compact --level info \
  --predicate "process == \"$EXE\"" > "$OUT/logs/app.log" 2>&1 &
LOG_PID=$!
trap 'kill "$LOG_PID" 2>/dev/null' EXIT

running() {
  xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -q "UIKitApplication:$BUNDLE"
}

shot() {
  xcrun simctl io "$UDID" screenshot "$OUT/shots/$1.png" >/dev/null 2>&1 || true
}

launch() {
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
}

# iOS 26 asks "Open in …?" before the simulator hands a deep link to the app.
# When the prompt's blue Open button is on screen, tap it (needs idb).
confirm_open() {
  command -v idb >/dev/null 2>&1 || return 0
  local i
  for i in 1 2 3 4; do
    xcrun simctl io "$UDID" screenshot "$OUT/.prompt.png" >/dev/null 2>&1 || return 0
    if python3 - "$OUT/.prompt.png" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
scale = im.size[0] / 402
blue = 0
for dx in range(-60, 61, 20):
    for dy in (-10, 0, 10):
        r, g, b = im.getpixel((int((275 + dx) * scale), int((474 + dy) * scale)))
        if b > 200 and r < 60:
            blue += 1
sys.exit(0 if blue >= 10 else 1)
PY
    then
      idb ui tap --udid "$UDID" 275 474 >/dev/null 2>&1 || true
      return 0
    fi
    sleep 1
  done
}

PAGES=(
  "app/post/742"
  "app/post/5799"
  "app/post/742/info"
  "maldoteth"
  "app/features"
  "app/leaderboard"
  "dao"
  "app/governance"
  "app/superpowers"
  "app/wallet"
  "app/fractions"
  "nfts"
  "app/agents"
  "packs"
  "creators"
  "raffle"
  "builder"
  "app/launchpad"
  "premium"
  "pricing"
  "depin"
  "app/bridge"
  "apps"
  "arcade"
  "arcade/gods-eye"
  "arcade/kings-gambit"
  "app/notifications"
  "app/messages"
  "compare"
  "app/planned"
  "live-studio"
  "accounts"
  "usernames"
  "converter"
  "creator/maboroshi"
  "creator/flow"
  "connect"
  "work/history"
  "feedback"
  "welcome"
  "signin"
)

walk() {
  local theme="$1"
  xcrun simctl ui "$UDID" appearance "$theme"
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  launch
  sleep 25
  shot "$theme-00-home"
  local i=1
  for page in "${PAGES[@]}"; do
    local name
    name="$(printf '%s-%02d-%s' "$theme" "$i" "$(echo "$page" | tr '/:?' '---')")"
    xcrun simctl openurl "$UDID" "dehub://$page" >/dev/null 2>&1 || echo "openurl failed: $page" >> "$OUT/crashes.txt"
    confirm_open
    sleep 6
    shot "$name"
    if ! running; then
      echo "$theme: app not running after opening $page" >> "$OUT/crashes.txt"
      launch
      sleep 20
    fi
    i=$((i + 1))
  done
}

walk dark
walk light

sleep 3
kill "$LOG_PID" 2>/dev/null
cp ~/Library/Logs/DiagnosticReports/"$EXE"*.ips "$OUT/logs/" 2>/dev/null || true
ls ~/Library/Logs/DiagnosticReports/ > "$OUT/logs/diagnostic-reports.txt" 2>/dev/null || true
grep -iE "fatal|exception|crash|unhandled|TypeError|ReferenceError|Invariant Violation|RCTFatal" "$OUT/logs/app.log" \
  | grep -v "libsystem" | head -400 > "$OUT/logs/errors.txt" || true

echo "Pages walked: ${#PAGES[@]} x 2 themes"
echo "Problems:"
cat "$OUT/crashes.txt"
echo "Error lines in app log: $(wc -l < "$OUT/logs/errors.txt")"
echo "JS restarts: $(grep -c 'state = restarting' "$OUT/logs/app.log")"
echo "Keychain failures: $(grep -c 'ERR_KEY_CHAIN' "$OUT/logs/app.log")"
rm -f "$OUT/.prompt.png"
