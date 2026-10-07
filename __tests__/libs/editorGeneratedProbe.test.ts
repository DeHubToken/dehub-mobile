import { probeGeneratedMedia } from "../../libs/editor/generatedMediaProbe";
import { Image } from "react-native";
import { createVideoPlayer } from "expo-video";
import { createAudioPlayer } from "expo-audio";

jest.mock("expo-video", () => ({ createVideoPlayer: jest.fn() }));
jest.mock("expo-audio", () => ({ createAudioPlayer: jest.fn() }));
let callbacks: Record<string, (info: any) => void>;
let player: any;
let remove: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); callbacks = {}; remove = jest.fn();
  player = { duration: 0, availableVideoTracks: [], isLoaded: false, release: jest.fn(), remove: jest.fn(),
    addListener: jest.fn((name, callback) => { callbacks[name] = callback; return { remove }; }) };
  jest.mocked(createVideoPlayer).mockReturnValue(player);
  jest.mocked(createAudioPlayer).mockReturnValue(player);
});
afterEach(() => jest.useRealTimers());

it("waits for video metadata, measures the complete source, then releases every subscription", async () => {
  const pending = probeGeneratedMedia("file:///generated.mp4", "video");
  callbacks.sourceLoad({ duration: 42.75, availableVideoTracks: [{ size: { width: 720, height: 1280 } }] });
  expect(await pending).toEqual({ duration: 42.75, width: 720, height: 1280 });
  expect(player.muted).toBe(true); expect(player.release).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(2); expect(jest.getTimerCount()).toBe(0);
  expect(player.play).toBeUndefined();
});
it("uses audio load events without playing and removes the audio player", async () => {
  const pending = probeGeneratedMedia("file:///voice.wav", "audio");
  callbacks.playbackStatusUpdate({ isLoaded: true, duration: 33.2 });
  expect(await pending).toEqual({ duration: 33.2, width: 0, height: 0 });
  expect(player.remove).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1);
});
it("reads already-loaded sources and rejects failed video decodes", async () => {
  player.isLoaded = true; player.duration = 8.5;
  expect(await probeGeneratedMedia("file:///voice.wav", "audio")).toMatchObject({ duration: 8.5 });
  const pending = probeGeneratedMedia("file:///broken.mp4", "video");
  callbacks.statusChange({ status: "error" });
  await expect(pending).rejects.toThrow("metadata"); expect(player.release).toHaveBeenCalledTimes(1);
});
it("releases the decoder on cancellation and on a bounded metadata timeout", async () => {
  const controller = new AbortController();
  const pending = probeGeneratedMedia("file:///generated.mp4", "video", controller.signal);
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(player.release).toHaveBeenCalledTimes(1);
  const timedOut = probeGeneratedMedia("file:///unreadable.mp4", "video");
  jest.advanceTimersByTime(15000);
  await expect(timedOut).rejects.toThrow("metadata"); expect(player.release).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it("measures images and avoids starting a decoder after cancellation", async () => {
  jest.mocked(Image.getSize).mockImplementation((...args: any[]) => { args[1](1024, 1024); return Promise.resolve({ width: 1024, height: 1024 }); });
  expect(await probeGeneratedMedia("file:///image.png", "image")).toEqual({ width: 1024, height: 1024 });
  const controller = new AbortController(); controller.abort();
  await expect(probeGeneratedMedia("file:///video.mp4", "video", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(createVideoPlayer).not.toHaveBeenCalled(); expect(createAudioPlayer).not.toHaveBeenCalled();
});
