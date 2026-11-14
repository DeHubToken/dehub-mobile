#!/usr/bin/env bash
# Times page switches (tabs, profiles, posts, Settings, Back) on a booted
# iPhone simulator, with main's app code and with this checkout's, inside the
# same native build. Used by ios-simulator-check.yml (task "nav").
#
#   scripts/ios-nav-timing.sh <simulator udid> <path to .app> <output dir>
#
# The app's JavaScript is bundled twice, once from BEFORE_REF's sources and
# once from this checkout's, each time with scripts/ios-nav/tour.ts added to
# the entry file. Each bundle is swapped into the built app in turn and the
# tour walks the same pages, noting how long the screen could not update after
# every switch. Runs alternate (before, after, before, after) so a slow moment
# on the runner does not land on one side only. Each tour ends with a swipe
# back from the left edge, made here with idb when it is installed.
#
# It compares app code only. Both bundles run on this checkout's node_modules;
# a patch this checkout adds under patches/ is taken off for the "before"
# bundle and put back afterwards.
set -uo pipefail

UDID="$1"
APP="$2"
OUT="$3"
BEFORE_REF="${BEFORE_REF:-main}"
ROUNDS="${ROUNDS:-2}"
THEME="${NAV_THEME:-system}"
# "probe" looks for where a switch spends its time instead of timing it.
MODE="${NAV_MODE:-nav}"
WORK="${RUNNER_TEMP:-/tmp}/ios-nav"
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
EXE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$APP/Info.plist")"
HERMESC="$PWD/node_modules/hermes-compiler/hermesc/osx-bin/hermesc"
[ -x "$HERMESC" ] || HERMESC="$PWD/node_modules/react-native/sdks/hermesc/osx-bin/hermesc"

mkdir -p "$OUT/nav" "$OUT/pages" "$OUT/logs" "$WORK"

# --- bundles -----------------------------------------------------------------

bundle() {
  local label="$1" dir="$WORK/$1"
  rm -rf "$dir" && mkdir -p "$dir/app"
  cp index.ts "$WORK/index.ts.orig"
  printf '\nimport "./scripts/ios-nav/tour";\n' >> index.ts
  local entry
  entry="$(node -e "require('expo/scripts/resolveAppEntry')" "$PWD" ios absolute | tail -n 1)"
  cat > "$WORK/bundle.sh" <<SH
set -euo pipefail
npx expo export:embed --platform ios --dev false --minify ${MINIFY:-true} --entry-file "$entry" \
  --bundle-output "$dir/main.js" --assets-dest "$dir/app"
SH
  # The app's config is inlined from the EAS production environment, as in the build.
  eas env:exec production "bash $WORK/bundle.sh" > "$OUT/logs/bundle-$label.log" 2>&1
  local status=$?
  cp "$WORK/index.ts.orig" index.ts
  if [ "$status" != 0 ] || [ ! -s "$dir/main.js" ]; then
    echo "Bundling $label failed"; tail -40 "$OUT/logs/bundle-$label.log"; return 1
  fi
  "$HERMESC" -emit-binary -O -out "$dir/app/main.jsbundle" "$dir/main.js" 2>> "$OUT/logs/bundle-$label.log" || {
    echo "hermesc failed for $label"; tail -20 "$OUT/logs/bundle-$label.log"; return 1; }
  echo "Bundled $label: $(du -h "$dir/app/main.jsbundle" | cut -f1)"
}

# node_modules as this checkout wants it, whatever was installed earlier.
npx patch-package --error-on-fail > "$OUT/logs/patch-package.log" 2>&1 || { cat "$OUT/logs/patch-package.log"; exit 1; }
git fetch --quiet --depth=1 origin "$BEFORE_REF:refs/remotes/origin/nav-before" || { echo "Cannot fetch $BEFORE_REF"; exit 1; }
HEAD_SHA="$(git rev-parse HEAD)"
BEFORE_SHA="$(git rev-parse refs/remotes/origin/nav-before)"
NEW_PATCHES="$(git diff --name-only --diff-filter=A "$BEFORE_SHA" "$HEAD_SHA" -- patches | grep '\.patch$' || true)"
echo "before = $BEFORE_REF ($BEFORE_SHA), after = $HEAD_SHA"
echo "Patches only in this checkout: ${NEW_PATCHES:-none}"

if [ "$MODE" = probe ]; then
  # One bundle, of this checkout, with its function names kept.
  MINIFY=false bundle after || exit 1
else
  for p in $NEW_PATCHES; do patch -R -p1 -s --no-backup-if-mismatch < "$p" || { echo "Cannot take $p off"; exit 1; }; done
  git checkout --quiet "$BEFORE_SHA" -- . ':(exclude).github' ':(exclude)scripts' || exit 1
  bundle before; BEFORE_OK=$?
  git reset --quiet --hard "$HEAD_SHA"
  for p in $NEW_PATCHES; do patch -p1 -s --no-backup-if-mismatch < "$p" || { echo "Cannot put $p back"; exit 1; }; done
  [ "$BEFORE_OK" = 0 ] || exit 1
  bundle after || exit 1
fi

# --- runs --------------------------------------------------------------------

xcrun simctl spawn "$UDID" log stream --style compact --level info \
  --predicate "process == \"$EXE\"" > "$OUT/logs/app.log" 2>&1 &
LOG_PID=$!
trap 'kill "$LOG_PID" 2>/dev/null' EXIT

storage_dir() {
  local data
  data="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)"
  echo "$data/Library/Application Support/$BUNDLE/RCTAsyncLocalStorage_V1"
}

# storage set <key> <value> ... | storage get <key> | storage drop <key>
storage() {
  python3 - "$(storage_dir)" "$@" <<'PY'
import hashlib, json, os, sys
directory, op, args = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(directory, exist_ok=True)
path = os.path.join(directory, "manifest.json")
manifest = {}
if os.path.exists(path):
    try:
        manifest = json.load(open(path))
    except Exception:
        manifest = {}
# Values too long for the manifest live in a file named after the key's md5.
blob = lambda key: os.path.join(directory, hashlib.md5(key.encode()).hexdigest())
if op == "set":
    for key, value in zip(args[0::2], args[1::2]):
        manifest[key] = value
    json.dump(manifest, open(path, "w"))
elif op == "drop":
    for key in args:
        manifest.pop(key, None)
        if os.path.exists(blob(key)):
            os.remove(blob(key))
    json.dump(manifest, open(path, "w"))
elif op == "get":
    key = args[0]
    value = manifest.get(key)
    if value is None and os.path.exists(blob(key)):
        value = open(blob(key)).read()
    sys.stdout.write(value or "")
PY
}

use_bundle() {
  cp -R "$WORK/$1/app/." "$APP/"
  codesign --force --sign - --preserve-metadata=entitlements "$APP" >/dev/null 2>&1 || true
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl install "$UDID" "$APP"
}

# Watches what the tour asks for until the stop file appears: a screenshot
# whenever it names a new picture, and a sample of every thread of the app
# (where each one is spending its time) whenever it names a new sampling.
#   shots <prefix> <stop file>
shots() {
  python3 - "$(storage_dir)/manifest.json" "$UDID" "$OUT" "$1" "$2" "$EXE" <<'PY'
import json, os, re, subprocess, sys, time
manifest, udid, out, prefix, stop, exe = sys.argv[1:7]
os.makedirs(f"{out}/pages", exist_ok=True)
last = sampled = None
safe = lambda name: re.sub(r"[^A-Za-z0-9_-]", "_", name)
while not os.path.exists(stop):
    try:
        keys = json.load(open(manifest))
    except Exception:
        keys = {}
    name = keys.get("dehub.perfTour.shot")
    if name and name != last:
        last = name
        subprocess.run(["xcrun", "simctl", "io", udid, "screenshot", "--type=jpeg", f"{out}/pages/{prefix}-{safe(name)}.jpg"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    name = keys.get("dehub.perfTour.sample")
    if name and name != sampled:
        sampled = name
        pid = subprocess.run(["pgrep", "-n", "-x", exe], capture_output=True, text=True).stdout.strip()
        if pid:
            subprocess.Popen(["sudo", "-n", "sample", pid, "12", "1", "-file", f"{out}/nav/{prefix}-sample-{safe(name)}.txt"],
                             stdout=open(f"{out}/logs/sample-{safe(name)}.log", "w"), stderr=subprocess.STDOUT)
        else:
            open(f"{out}/logs/sample-{safe(name)}.log", "w").write(f"no process named {exe}\n")
    time.sleep(0.12)
PY
}

# run <before|after> <name> [record] [tour: 1 = main switches, pages = every page] [theme]
run() {
  local variant="$1" name="$2" record="${3:-}" tour="${4:-1}" theme="${5:-$THEME}"
  local recorder="" started=0 swiped=0 tries=180
  use_bundle "$variant"
  storage drop dehub.perfTour.result dehub.perfTour.swipe dehub.perfTour.shot dehub.perfTour.sample
  storage set dehub.theme "$theme" dehub.perfTour "$tour"
  if [ "$tour" != 1 ]; then
    tries=480
    rm -f "$WORK/shots.stop"
    shots "$name" "$WORK/shots.stop" &
  fi
  if [ -n "$record" ]; then
    xcrun simctl io "$UDID" recordVideo --codec hevc --force "$OUT/nav/$name.mov" 2> "$WORK/record.log" &
    recorder=$!
    for _ in $(seq 1 50); do grep -q "Recording started" "$WORK/record.log" && break; sleep 0.1; done
    python3 -c 'import time; print(int(time.time()*1000))' > "$OUT/nav/$name.video-start"
  fi
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  local result=""
  for _ in $(seq 1 "$tries"); do
    sleep 2
    # The tour ends on Settings and waits for a slow swipe in from the left
    # edge: a real touch, which only idb can make.
    if [ "$swiped" = 0 ] && [ "$(storage get dehub.perfTour.swipe)" = "ready" ]; then
      swiped=1
      if command -v idb >/dev/null 2>&1; then
        python3 -c 'import time; print(int(time.time()*1000))' > "$OUT/nav/$name.swipe-start"
        idb ui swipe --udid "$UDID" --duration 1.2 1 430 330 430 >/dev/null 2>&1 || echo "$name: idb swipe failed"
      fi
    fi
    result="$(storage get dehub.perfTour.result)"
    case "$result" in '{"done":true'*) started=1; break ;; esac
  done
  touch "$WORK/shots.stop"
  xcrun simctl io "$UDID" screenshot "$OUT/nav/$name-end.png" >/dev/null 2>&1 || true
  if [ -n "$recorder" ]; then kill -INT "$recorder" 2>/dev/null; wait "$recorder" 2>/dev/null; fi
  printf '%s' "$result" > "$OUT/nav/$name.json"
  [ "$started" = 1 ] && echo "$name: finished" || echo "$name: did not finish"
}

xcrun simctl ui "$UDID" appearance dark
for service in photos camera microphone location; do
  xcrun simctl privacy "$UDID" grant "$service" "$BUNDLE" >/dev/null 2>&1 || true
done

if [ "$MODE" = probe ]; then
  run after probe record probe
  kill "$LOG_PID" 2>/dev/null
  grep -E '\[perf-tour\]|\[FatalJS\]|\[UncaughtJS\]' "$OUT/logs/app.log" | cut -c1-400 > "$OUT/logs/tour.txt" || true
  exit 0
fi

# One unmeasured run first: it fills the caches both sides then share.
run before warmup
for round in $(seq 1 "$ROUNDS"); do
  # Only the first round is filmed: the films are large.
  run before "before-$round" "$([ "$round" = 1 ] && echo record)"
  run after "after-$round" "$([ "$round" = 1 ] && echo record)"
done

# Every page, opened twice, with a picture of each: main's code, this
# checkout's, then this checkout's again in other themes.
if [ "${PAGES_TOUR:-1}" = 1 ]; then
  run before pages-before "" pages
  run after pages-after "" pages
  for theme in ${PAGE_THEMES:-system-light hazy}; do
    run after "pages-after-$theme" "" pages "$theme"
  done
fi

kill "$LOG_PID" 2>/dev/null
cp ~/Library/Logs/DiagnosticReports/"$EXE"*.ips "$OUT/logs/" 2>/dev/null || true
grep -E '\[perf-tour\]|\[FatalJS\]|\[UncaughtJS\]' "$OUT/logs/app.log" | cut -c1-400 > "$OUT/logs/tour.txt" || true

python3 scripts/ios-nav/summary.py "$OUT/nav" | tee "$OUT/nav/summary.md"
python3 scripts/ios-nav/summary.py "$OUT/nav" pages > "$OUT/nav/summary-pages.md"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$OUT/nav/summary.md" >> "$GITHUB_STEP_SUMMARY"
exit 0
