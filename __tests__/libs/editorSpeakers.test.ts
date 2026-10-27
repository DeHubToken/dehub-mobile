import { describe, expect, it } from "@jest/globals";
import { otherSpeakerRanges, speakerChangePoints, speakerTurns, summariseSpeakers, segmentsFromTrim } from "../../libs/editor/speakers";

const segments = [
  { speaker: "speaker_0", text: "Welcome to the show.", start: 0.2 },
  { speaker: "speaker_1", text: "Thanks for having me.", start: 4 },
  { speaker: "speaker_1", text: "Big fan.", start: 6 },
  { speaker: "speaker_0", text: "So tell me", start: 8 },
  { speaker: null, text: "(laughs)", start: 9 },
];

describe("speaker turns", () => {
  it("joins consecutive lines and runs each turn to the next", () => {
    const turns = speakerTurns(segments, 12);
    expect(turns.map(t => [t.speaker, t.from, t.to])).toEqual([["speaker_0", 0.2, 4], ["speaker_1", 4, 8], ["speaker_0", 8, 12]]);
    expect(turns[1].text).toBe("Thanks for having me. Big fan.");
  });

  it("maps source seconds to clip time on a sped-up clip", () => {
    const turns = speakerTurns(segments, 6, 2);
    expect(turns.map(t => [t.from, t.to])).toEqual([[0.1, 2], [2, 4], [4, 6]]);
  });

  it("summarises talk time and builds keep-one cuts and split points", () => {
    const turns = speakerTurns(segments, 12);
    const summary = summariseSpeakers(turns);
    expect(summary[0].speaker).toBe("speaker_0");
    expect(summary[0].share).toBeCloseTo(7.8 / 11.8, 3);
    expect(otherSpeakerRanges(turns, "speaker_0")).toEqual([{ from: 4, to: 8, text: "Thanks for having me. Big fan." }]);
    expect(speakerChangePoints(turns, 12)).toEqual([4, 8]);
  });

  it("moves whole-file times onto the trimmed clip", () => {
    expect(segmentsFromTrim(segments, 4).map(s => s.start)).toEqual([0, 2, 4, 5]);
  });
});
