import { backgroundRemovalScope, matchesBackgroundRemovalScope, backgroundRemovalFailureMessage, isBackgroundRemovalCancellation } from "../../libs/editor/backgroundRemovalFailure";
import type { MediaClip } from "../../libs/editor/types";

const clip: MediaClip = { id: "clip", kind: "video", trackId: "video", mediaId: "source", start: 0, trimIn: 2, duration: 3 };

it("recognizes cancellation across browser realms without requiring an Error prototype", () => {
  expect(isBackgroundRemovalCancellation(new DOMException("Cancelled", "AbortError"))).toBe(true);
  expect(isBackgroundRemovalCancellation({ name: "AbortError", message: "Source changed" })).toBe(true);
  expect(isBackgroundRemovalCancellation(new Error("Cancelled"))).toBe(false);
  expect(isBackgroundRemovalCancellation(null)).toBe(false);
});

it("shows a failure only for the original project and source range", () => {
  const scope = backgroundRemovalScope("project", clip);
  expect(matchesBackgroundRemovalScope(scope, "project", { ...clip, start: 30, speed: 1 })).toBe(true);
  expect(matchesBackgroundRemovalScope(scope, "other", clip)).toBe(false);
  for (const patch of [{ id: "other" }, { mediaId: "other" }, { trimIn: 1 }, { duration: 2 }, { speed: 2 }, { locked: true }]) {
    expect(matchesBackgroundRemovalScope(scope, "project", { ...clip, ...patch })).toBe(false);
  }
  expect(matchesBackgroundRemovalScope(scope, "project", undefined)).toBe(false);
  expect(matchesBackgroundRemovalScope(null, "project", clip)).toBe(false);
});

it("retains the actionable reason and bounds long worker errors", () => {
  expect(backgroundRemovalFailureMessage(new Error("Frame could not be decoded"), "failed")).toBe("Frame could not be decoded");
  expect(backgroundRemovalFailureMessage(new Error(" "), "failed")).toBe("failed");
  expect(backgroundRemovalFailureMessage(null, "failed")).toBe("failed");
  expect(backgroundRemovalFailureMessage(new Error("x".repeat(2000)), "failed")).toHaveLength(1000);
});
