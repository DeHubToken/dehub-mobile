/**
 * The sanitiser in front of tip-to-speech.
 *
 * These assertions are deliberately the same as dehubweb's
 * src/test/tip-tts.test.ts. Both platforms read the SAME `streamer.tip`
 * broadcast, so a message one of them trims and the other does not is one the
 * room hears differently depending on what they are watching on.
 */
import * as Speech from "expo-speech";
import i18n from "i18next";
import {
  sanitiseTtsText,
  speakTipMessage,
  setTipTtsEnabled,
  tipVoiceLang,
  MAX_TTS_CHARS,
} from "../../libs/tipTts";

jest.mock("expo-speech", () => ({
  speak: jest.fn((_text: string, opts: { onDone?: () => void }) => opts.onDone?.()),
  stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: jest.fn(() =>
    Promise.resolve([
      { identifier: "en-us-x-iol-local", language: "en-US", quality: "Enhanced" },
      { identifier: "ru-ru-x-ruf-local", language: "ru-RU", quality: "Default" },
    ])
  ),
  VoiceQuality: { Enhanced: "Enhanced" },
}), { virtual: true });

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("sanitiseTtsText", () => {
  it("keeps an ordinary message intact", () => {
    expect(sanitiseTtsText("Big papa says hello, stream!")).toBe(
      "Big papa says hello, stream!"
    );
  });

  it("drops links rather than spelling them out", () => {
    expect(sanitiseTtsText("check https://dehub.io/app now")).toBe("check now");
  });

  it("collapses punctuation spam that would stall the synthesiser", () => {
    expect(sanitiseTtsText("hello!!!!!!!!!! there")).toBe("hello! there");
  });

  it("strips control characters", () => {
    const withControls =
      "hi" + String.fromCharCode(7) + String.fromCharCode(0) + "there";
    expect(sanitiseTtsText(withControls)).toBe("hi there");
  });

  it("caps length so one tip cannot hold the stream audio", () => {
    expect(sanitiseTtsText("word ".repeat(200)).length).toBeLessThanOrEqual(
      MAX_TTS_CHARS
    );
  });

  it("returns empty for nothing worth speaking", () => {
    expect(sanitiseTtsText("")).toBe("");
    expect(sanitiseTtsText(null)).toBe("");
    expect(sanitiseTtsText(undefined)).toBe("");
    expect(sanitiseTtsText("https://example.com")).toBe("");
    expect(sanitiseTtsText("   ")).toBe("");
  });

  it("keeps letters from non-Latin scripts", () => {
    expect(sanitiseTtsText("привет мир")).toBe("привет мир");
  });
});

describe("tipVoiceLang", () => {
  it("reads Latin text in a Latin-script viewer language", () => {
    expect(tipVoiceLang("hola amigos", "es")).toBe("es");
  });

  it("reads Latin text in English for a non-Latin viewer", () => {
    expect(tipVoiceLang("hello stream", "ru")).toBe("en");
  });

  it("follows the script of the message", () => {
    expect(tipVoiceLang("привет", "en")).toBe("ru");
    expect(tipVoiceLang("привіт", "uk")).toBe("uk");
    expect(tipVoiceLang("こんにちは", "en")).toBe("ja");
  });
});

describe("speakTipMessage", () => {
  const speak = Speech.speak as jest.Mock;
  beforeEach(() => {
    speak.mockClear();
    setTipTtsEnabled(true);
    (i18n as { language?: string }).language = "en";
  });

  it("reads a sanitised line in the phone's own voice", async () => {
    speakTipMessage("say  this   out loud");
    await flush();
    await flush();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe("say this out loud");
    expect(speak.mock.calls[0][1]).toMatchObject({ language: "en", voice: "en-us-x-iol-local" });
  });

  it("does not queue a gift with no message", async () => {
    speakTipMessage(undefined);
    speakTipMessage("https://only-a-link.example");
    await flush();
    expect(speak).not.toHaveBeenCalled();
  });

  it("says nothing while readings are switched off", async () => {
    setTipTtsEnabled(false);
    speakTipMessage("should stay quiet");
    await flush();
    expect(speak).not.toHaveBeenCalled();
  });
});
