

# DeHub Translation System — Full Documentation

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                      USER TAPS 🌐                       │
│                   (on-demand only)                       │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   Client-Side Cache       │
         │   (in-memory Map)         │
         │   key: text + targetLang  │
         └─────────┬─────────────────┘
                   │ miss
         ┌─────────▼─────────────────┐
         │  Edge Function            │
         │  translate-text           │
         ├───────────────────────────┤
         │  1. Server cache (Map)    │
         │  2. MyMemory API (free)   │
         │  3. AI gateway fallback   │
         │     (Gemini 2.5 Flash)    │
         └───────────────────────────┘
```

---

## 1. Backend: Edge Function (`translate-text`)

**Endpoint:** `POST /functions/v1/translate-text`

**Request body:**
```json
{
  "text": "Hola mundo",
  "targetLang": "en",
  "sourceLang": "auto"   // optional, defaults to auto-detect
}
```

**Response:**
```json
{
  "translatedText": "Hello world",
  "detectedLanguage": {
    "language": "es",
    "confidence": 1.0
  }
}
```

**Error responses:**
- `400` — missing `text` or `targetLang`
- `503` — all translation backends failed
- `500` — internal error

### Translation Pipeline (in order)

| Step | Provider | Condition | Timeout | Cost |
|------|----------|-----------|---------|------|
| 0 | **Server cache** | In-memory Map (max 500 entries, LRU eviction) | — | Free |
| 1 | **MyMemory API** | Text ≤ 500 chars. Skipped if text is longer. | 5s | Free (1000 words/day) |
| 2 | **AI gateway** (Gemini 2.5 Flash Lite) | Fallback when MyMemory fails/skipped | Default | AI credits |

MyMemory is rejected if:
- HTTP error
- `responseStatus !== 200`
- Response contains `MYMEMORY WARNING`
- Translated text is identical to input (couldn't translate)

### Supported Languages

36 language codes mapped for MyMemory (`langCodeMap`), with full language names for AI prompts (`langNameMap`). Dialectal codes (e.g. `arz` Egyptian Arabic, `pcm` Nigerian Pidgin) are mapped to their closest standard for MyMemory, while AI handles them natively.

---

## 2. Frontend: Hook & Components

### `useUserLanguage()` — User's Target Language

- Reads from `localStorage('user-preferred-language')`
- Falls back to `navigator.language` (browser setting)
- Exposes `setPreferredLanguage(lang)` which also switches the i18n UI locale

### `useTranslation(text)` — Core Translation Hook

**On-demand only.** No auto-detection or auto-translation. Returns:

```typescript
{
  userLang: string;
  isTranslated: boolean;
  translatedText: string;
  sourceLang: string | null;
  isLoading: boolean;
  error: string | null;
  isTooShort: boolean;       // text < 1 char
  handleTranslate: () => void;
  handleShowOriginal: () => void;
}
```

- Client-side cache: `Map<"text-targetLang", { translated, sourceLang }>` (persists for session lifetime, no limit)
- Calls the edge function via `supabase.functions.invoke('translate-text', ...)`

### `<TranslatableText>` — Inline Translatable Element

Wraps text content. When translated, cross-fades (Framer Motion, 150ms) between original and translated text. Processes `@mentions`, `$cashtags`, and URLs into interactive elements via `renderTextWithLinks()`.

### `<SharedTranslationProvider>` — Group Synchronization

Wraps sibling `<TranslatableText>` components (e.g., a post's title + description). When one triggers translation, all siblings translate simultaneously via a shared React context with `translateSignal` / `originalSignal` counters.

### `useSharedTranslationControl()` — External Trigger

Used by `PostMetadata` to render a single 🌐 button that controls translation for all `<TranslatableText>` children in the same provider.

### `<BioTranslateButton>` — Profile Bio Translation

Standalone button with its own `sessionStorage` cache (keyed by bio content + language). Separate from the shared translation system.

### Translation UI Pattern in Post Cards

```text
┌──────────────────────────────┐
│ SharedTranslationProvider    │
│  ┌────────────────────────┐  │
│  │ TranslatableText       │  │  ← title
│  │ (hideControls=true)    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ TranslatableText       │  │  ← description
│  │ (hideControls=true)    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ PostMetadata            │  │  ← shows 🌐 or ↩ button
│  │ (translateControl)     │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

The translate control (🌐 icon) is rendered in `PostMetadata` alongside timestamp and view count. When tapped, it triggers `useSharedTranslationControl().handleTranslate()`, which propagates through the context to all `TranslatableText` children.

---

## 3. Mobile App Implementation Guide

### API Contract

Mobile apps should call the **same edge function** endpoint:

```
POST https://<project-url>/functions/v1/translate-text
Headers:
  Content-Type: application/json
  Authorization: Bearer <anon_key>
  apikey: <anon_key>

Body: { "text": "...", "targetLang": "en", "sourceLang": "auto" }
```

### Recommended Architecture

```text
┌─────────────────────────────────────┐
│         Mobile Translation          │
├─────────────────────────────────────┤
│                                     │
│  1. TranslationCache (LRU)          │
│     - In-memory dictionary          │
│     - Key: hash(text) + targetLang  │
│     - Max ~200 entries              │
│                                     │
│  2. TranslationService              │
│     - Single async method:          │
│       translate(text, targetLang)    │
│     - Check cache → call API        │
│     - Return translated string      │
│                                     │
│  3. User Language                   │
│     - Read from device locale       │
│     - Allow manual override         │
│     - Persist choice (UserDefaults  │
│       / SharedPreferences)          │
│                                     │
└─────────────────────────────────────┘
```

### iOS (Swift) Example

```swift
class TranslationService {
    static let shared = TranslationService()
    private var cache: [String: String] = [:]
    
    func translate(_ text: String, to targetLang: String) async throws -> String {
        let key = "\(text.prefix(200).hashValue)_\(targetLang)"
        if let cached = cache[key] { return cached }
        
        var request = URLRequest(url: URL(string: "\(baseURL)/functions/v1/translate-text")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode([
            "text": text,
            "targetLang": targetLang
        ])
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(TranslateResponse.self, from: data)
        cache[key] = response.translatedText
        return response.translatedText
    }
}
```

### Android (Kotlin) Example

```kotlin
object TranslationService {
    private val cache = lruCache<String, String>(200)
    
    suspend fun translate(text: String, targetLang: String): String {
        val key = "${text.take(200).hashCode()}_$targetLang"
        cache[key]?.let { return it }
        
        val response = httpClient.post("$baseUrl/functions/v1/translate-text") {
            contentType(ContentType.Application.Json)
            bearerAuth(anonKey)
            setBody(TranslateRequest(text, targetLang))
        }
        val result = response.body<TranslateResponse>()
        cache.put(key, result.translatedText)
        return result.translatedText
    }
}
```

### Mobile UI Guidelines

1. **Trigger**: Show a 🌐 (globe) icon in the post metadata row (next to timestamp/views). On-demand only — no auto-translation.

2. **Loading state**: Replace the globe with a spinner while the API call is in flight.

3. **Translated state**: Replace the globe with a ↩ (undo/rotate) icon. Tapping it reverts to original text instantly (no API call).

4. **Animation**: Cross-fade (150ms) between original and translated text for a polished feel.

5. **Group sync**: When a post has both title and description, translating one should translate both simultaneously. Maintain a shared state object per post card.

6. **Bio translation**: Profile bios have a separate globe button near the "Joined" date. Same API, separate cache (can use disk cache since bios change infrequently).

7. **Error handling**: On failure, show a brief inline "Translation unavailable" message that auto-dismisses after 3 seconds. Do not show an alert/dialog.

8. **Target language**: Read from device locale (`Locale.current.language` on iOS, `Locale.getDefault()` on Android). Allow override in app settings. Persist with UserDefaults/SharedPreferences.

9. **Performance rules**:
   - Cache translations in memory (LRU, ~200 entries)
   - Skip translation if text < 1 character
   - Don't re-translate if user scrolls away and back — use cached result
   - Debounce rapid taps on the translate button

10. **Rich text preservation**: The API preserves emojis, line breaks, and formatting. Mobile should maintain the same `@mention` and `$cashtag` parsing after translation — run your link/mention parser on the translated output.

### Language Codes Reference

Use standard ISO 639-1 codes. The backend supports 36+ codes including dialects:

| Code | Language | Code | Language |
|------|----------|------|----------|
| en | English | ar | Arabic |
| es | Spanish | hi | Hindi |
| fr | French | ja | Japanese |
| de | German | ko | Korean |
| pt | Portuguese | zh | Chinese |
| ru | Russian | th | Thai |
| tr | Turkish | vi | Vietnamese |
| id | Indonesian | ms | Malay |
| pl | Polish | nl | Dutch |
| uk | Ukrainian | ro | Romanian |
| tl | Tagalog | sw | Swahili |
| pcm | Nigerian Pidgin | arz | Egyptian Arabic |
| ary | Moroccan Arabic | ha | Hausa |

Full list of 110+ languages available in the language selector (`LANGUAGE_NAMES` map).

