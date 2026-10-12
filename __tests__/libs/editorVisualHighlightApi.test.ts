jest.mock("../../config/env", () => ({ __esModule: true, default: { SUPABASE_URL: "https://edge.test/", SUPABASE_PUBLISHABLE_KEY: "public-test-key" } }));
import { analyseVisualHighlights } from "../../libs/editor/visualHighlightApi";
import { visualSampleTimes, type VisualBatch } from "../../libs/editor/visualHighlightContract";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooorjPmD/9k=";
const windows = [{ id: 0, start: 0, end: 6 }];
const batch = (purpose?: "matching"): VisualBatch => ({ optIn: true, duration: 6, seconds: 15, focus: "red scenes", purpose, windows,
  frames: visualSampleTimes(windows[0]).map(at => ({ windowId: 0, at, dataUrl: JPEG })) });
const moments = [{ start: 0, end: 2, score: 0.95, description: "Red title card", focusMatch: true }];

const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeEach(() => { jest.clearAllMocks(); global.fetch = mockFetch; });
afterEach(() => { global.fetch = originalFetch; });
const reply = (contract: number) => mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ contract, moments }) });
describe("visual matching contract rollout", () => {
  it.each([1, 2])("accepts matching contract %i with one unchanged sample request", async contract => {
    const request = batch("matching"), signal = new AbortController().signal;
    reply(contract);
    expect(await analyseVisualHighlights(request, signal)).toEqual(moments);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("https://edge.test/functions/v1/editor-visual-highlights", expect.objectContaining({ body: JSON.stringify(request), signal }));
  });
  it("keeps ordinary highlight responses on contract one", async () => {
    reply(1);
    expect(await analyseVisualHighlights(batch(), new AbortController().signal)).toEqual(moments);
  });
  it.each([[undefined, 2], ["matching", 3], ["matching", 0]] as const)("rejects incompatible %s contract %i without retrying", async (purpose, contract) => {
    reply(contract);
    await expect(analyseVisualHighlights(batch(purpose), new AbortController().signal)).rejects.toThrow("unavailable");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
