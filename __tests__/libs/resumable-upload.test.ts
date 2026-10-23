/**
 * resumableUploadFile() — composer videos in chunks over the node-uploadx protocol.
 *
 * A fake server answers the way the API does (201 + Location, 308 + Range per
 * chunk, 200 + the draft on the last byte), and a fake disk stands in for
 * expo-file-system, so these run the real chunking, scratch-file and resume
 * logic end to end. Each test breaks the upload the way a phone does.
 */
import { AppState } from 'react-native';

type Fault = 'network' | 'hang' | number | undefined;

const mockDisk: Record<string, Uint8Array> = {};
const mockAuth = { token: 'tok-1' };
const mockServer = {
  token: 'tok-1',
  size: 0,
  held: 0,
  sessions: 0,
  createStatus: 201,
  finishStatus: 200,
  faults: [] as Fault[],
  rotateAfter: 0,
  accepted: [] as Array<[number, number]>,
  received: new Uint8Array(0),
  requests: [] as Array<{ method: string; url: string; headers: Record<string, string> }>,
};

type MockReply = { status: number; headers: Record<string, string>; body: string };

function mockRespond(method: string, url: string, headers: Record<string, string>, body: Uint8Array | null): MockReply | 'network' | 'hang' {
  mockServer.requests.push({ method, url, headers });
  const reply = (status: number, text = '', extra: Record<string, string> = {}): MockReply => ({ status, headers: extra, body: text });
  if (headers.Authorization !== `Bearer ${mockServer.token}`) return reply(401, '{"message":"Access token expired"}');

  if (method === 'POST') {
    if (mockServer.createStatus !== 201) return reply(mockServer.createStatus, '{"message":"nope"}');
    mockServer.sessions++;
    mockServer.size = Number(headers['X-Upload-Content-Length']);
    mockServer.held = 0;
    mockServer.received = new Uint8Array(mockServer.size);
    return reply(201, `{"uploadId":"s${mockServer.sessions}"}`, { Location: `/api/draft_video/resumable?upload_id=s${mockServer.sessions}` });
  }
  if (method === 'DELETE') return reply(204);

  const range = headers['Content-Range'];
  const done = () =>
    mockServer.finishStatus === 200
      ? reply(200, '{"draftId":"draft-1","status":"processing"}')
      : reply(mockServer.finishStatus, '{"message":"\\"clip.mp4\\" doesn\'t look like a readable video file."}');
  const partial = () => reply(308, '', { range: `bytes=0-${mockServer.held - 1}` });

  if (/^bytes \*\//.test(range)) return mockServer.held >= mockServer.size ? done() : partial();

  const fault = mockServer.faults.shift();
  if (fault === 'network' || fault === 'hang') return fault;
  if (fault === 404) mockServer.held = 0;
  if (typeof fault === 'number') return reply(fault, '{"message":"fault"}');

  const [, a, b] = /^bytes (\d+)-(\d+)\/\d+$/.exec(range) as RegExpExecArray;
  const start = Number(a);
  const end = Number(b);
  if (start > mockServer.held) return reply(409, '{"message":"gap"}');
  expect(body?.length).toBe(end - start + 1);
  mockServer.received.set(body as Uint8Array, start);
  mockServer.accepted.push([start, end]);
  mockServer.held = Math.max(mockServer.held, end + 1);
  if (mockServer.accepted.length === mockServer.rotateAfter) mockServer.token = 'tok-2';
  return mockServer.held >= mockServer.size ? done() : partial();
}

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    modificationTime = 1700000000000;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return this.uri in mockDisk;
    }
    get size() {
      return mockDisk[this.uri]?.length ?? 0;
    }
    create() {
      if (this.uri in mockDisk) throw new Error('exists');
      mockDisk[this.uri] = new Uint8Array(0);
    }
    write(bytes: Uint8Array) {
      mockDisk[this.uri] = bytes.slice();
    }
    delete() {
      delete mockDisk[this.uri];
    }
    open() {
      const data = mockDisk[this.uri];
      if (!data) throw new Error('cannot open');
      let offset = 0;
      return {
        get offset() {
          return offset;
        },
        set offset(value: number) {
          offset = value;
        },
        readBytes(length: number) {
          const out = data.slice(offset, offset + length);
          offset += out.length;
          return out;
        },
        close() {},
      };
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache' } } };
});

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: (url: string, fileUri: string, options: any, onProgress: (p: any) => void) => {
    let cancel: () => void = () => {};
    return {
      cancelAsync: jest.fn(async () => cancel()),
      uploadAsync: () =>
        new Promise((resolve, reject) => {
          const body = mockDisk[fileUri];
          const outcome = mockRespond('PUT', url, options.headers, body);
          if (outcome === 'network') return reject(new Error('The network connection was lost.'));
          if (outcome === 'hang') {
            cancel = () => resolve(undefined);
            return;
          }
          onProgress({ totalBytesSent: body.length, totalBytesExpectedToSend: body.length });
          resolve(outcome);
        }),
    };
  },
}));

jest.mock('../../libs/token-refresh', () => ({
  tokenRefreshManager: {
    ensureFreshToken: jest.fn(async () => {}),
    attemptRefresh: jest.fn(async () => {
      mockAuth.token = 'tok-2';
      return 'tok-2';
    }),
  },
}));
jest.mock('../../libs/auth.utils', () => ({ getAuthToken: jest.fn(async () => mockAuth.token) }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { API_URL: 'https://api.test.dehub.io/api' } }));

class MockXhr {
  status = 0;
  responseText = '';
  timeout = 0;
  responseType = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private method = '';
  private url = '';
  private headers: Record<string, string> = {};
  private replyHeaders: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  getResponseHeader(name: string) {
    const key = Object.keys(this.replyHeaders).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? this.replyHeaders[key] : null;
  }
  abort() {}
  send() {
    queueMicrotask(() => {
      const outcome = mockRespond(this.method, this.url, this.headers, null);
      if (outcome === 'network') return this.onerror?.();
      if (outcome === 'hang') return;
      this.status = outcome.status;
      this.responseText = outcome.body;
      this.replyHeaders = outcome.headers;
      this.onload?.();
    });
  }
}

import { FIRST_CHUNK_BYTES, ResumableUnsupportedError, heldBytes, nextChunkSize, resumableUploadFile } from '../../libs/resumable-upload';
import { tokenRefreshManager } from '../../libs/token-refresh';

const SOURCE = 'file:///videos/clip.mp4';
const putFile = (bytes: number) => {
  const data = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) data[i] = (i * 31 + 7) & 0xff;
  mockDisk[SOURCE] = data;
  return data;
};
const upload = (extra: Record<string, unknown> = {}) =>
  resumableUploadFile({
    endpoint: '/draft_video/resumable',
    uri: SOURCE,
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    metadata: { postType: 'video' },
    retryBaseMs: 1,
    ...extra,
  });
const chunkPuts = () => mockServer.requests.filter((r) => r.method === 'PUT' && !/\*/.test(r.headers['Content-Range']));

const originalXhr = (global as any).XMLHttpRequest;

beforeEach(() => {
  Object.keys(mockDisk).forEach((k) => delete mockDisk[k]);
  Object.assign(mockServer, {
    token: 'tok-1', size: 0, held: 0, sessions: 0, createStatus: 201, finishStatus: 200,
    faults: [], rotateAfter: 0, accepted: [], received: new Uint8Array(0), requests: [],
  });
  mockAuth.token = 'tok-1';
  (global as any).XMLHttpRequest = MockXhr;
});

afterAll(() => {
  (global as any).XMLHttpRequest = originalXhr;
});

it('sends the video chunk by chunk from scratch files and resolves with the draft', async () => {
  const data = putFile(4 * FIRST_CHUNK_BYTES + 77);
  const progress: number[] = [];

  await expect(upload({ onProgress: (f: number) => progress.push(f) })).resolves.toEqual({ draftId: 'draft-1', status: 'processing' });

  expect(Buffer.from(mockServer.received).equals(Buffer.from(data))).toBe(true);
  expect(chunkPuts()[0].headers['Content-Range']).toBe(`bytes 0-${FIRST_CHUNK_BYTES - 1}/${data.length}`);
  const create = mockServer.requests[0];
  expect(create.url).toBe('https://api.test.dehub.io/api/draft_video/resumable');
  expect(create.headers).toMatchObject({ 'X-Client-Type': 'mobile', 'X-Upload-Content-Length': String(data.length) });
  expect(chunkPuts()[0].url).toBe('https://api.test.dehub.io/api/draft_video/resumable?upload_id=s1');
  expect(progress[progress.length - 1]).toBe(1);
  // Scratch chunks do not pile up in the cache.
  expect(Object.keys(mockDisk)).toEqual([SOURCE]);
});

it('carries on from the server\'s offset after the connection drops', async () => {
  const data = putFile(3 * FIRST_CHUNK_BYTES);
  mockServer.faults = [undefined, 'network', 'network'];

  await expect(upload()).resolves.toMatchObject({ draftId: 'draft-1' });

  expect(Buffer.from(mockServer.received).equals(Buffer.from(data))).toBe(true);
  expect(mockServer.sessions).toBe(1);
  expect(mockServer.accepted[1][0]).toBe(FIRST_CHUNK_BYTES);
  expect(mockServer.requests.some((r) => r.headers['Content-Range'] === `bytes */${data.length}`)).toBe(true);
});

it('picks up the moment the app is back in the foreground', async () => {
  putFile(2 * FIRST_CHUNK_BYTES);
  const listeners: Array<(state: string) => void> = [];
  (AppState.addEventListener as jest.Mock).mockImplementation((_event: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: jest.fn() };
  });
  // Suspended mid-chunk; the backoff after it would be a minute.
  mockServer.faults = ['network'];
  const pending = upload({ retryBaseMs: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(listeners.length).toBeGreaterThan(0);

  listeners.forEach((cb) => cb('active'));

  await expect(pending).resolves.toMatchObject({ draftId: 'draft-1' });
  expect(mockServer.sessions).toBe(1);
});

it('refreshes a token that lapses mid-upload and keeps going', async () => {
  putFile(3 * FIRST_CHUNK_BYTES);
  mockServer.rotateAfter = 1;

  await expect(upload()).resolves.toMatchObject({ draftId: 'draft-1' });

  expect(tokenRefreshManager.attemptRefresh).toHaveBeenCalled();
  expect(chunkPuts()[chunkPuts().length - 1].headers.Authorization).toBe('Bearer tok-2');
  expect(mockServer.sessions).toBe(1);
});

it('starts a new session when the server has dropped the old one', async () => {
  const data = putFile(3 * FIRST_CHUNK_BYTES);
  mockServer.faults = [undefined, 404];

  await expect(upload()).resolves.toMatchObject({ draftId: 'draft-1' });
  expect(mockServer.sessions).toBe(2);
  expect(Buffer.from(mockServer.received).equals(Buffer.from(data))).toBe(true);
});

it('leaves a file it cannot read in ranges to the old upload', async () => {
  await expect(upload({ uri: 'content://media/external/video/1' })).rejects.toBeInstanceOf(ResumableUnsupportedError);
  expect(mockServer.requests).toHaveLength(0);
});

it('leaves an API without the endpoint to the old upload', async () => {
  putFile(1000);
  mockServer.createStatus = 404;
  await expect(upload()).rejects.toBeInstanceOf(ResumableUnsupportedError);
});

it('passes a refusal of the finished file through with its status', async () => {
  putFile(1000);
  mockServer.finishStatus = 400;
  await expect(upload()).rejects.toMatchObject({ status: 400, message: expect.stringContaining('readable video') });
});

it('cancels the session on the server when the composer lets go', async () => {
  putFile(2 * FIRST_CHUNK_BYTES);
  mockServer.faults = ['hang'];
  const abortRef = { current: false };
  const pending = upload({ abortRef });
  await new Promise((resolve) => setTimeout(resolve, 20));
  abortRef.current = true;

  await expect(pending).rejects.toThrow('Upload cancelled');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockServer.requests.some((r) => r.method === 'DELETE' && r.url.includes('upload_id=s1'))).toBe(true);
});

describe('chunk sizing', () => {
  it('reads the offset from a Range header', () => {
    expect(heldBytes('bytes=0-1048575')).toBe(1048576);
    expect(heldBytes('bytes=0--1')).toBe(0);
    expect(heldBytes(null)).toBe(0);
  });

  it('grows on a fast line and shrinks on a slow one', () => {
    expect(nextChunkSize(FIRST_CHUNK_BYTES, FIRST_CHUNK_BYTES, 100)).toBe(2 * FIRST_CHUNK_BYTES);
    expect(nextChunkSize(FIRST_CHUNK_BYTES, FIRST_CHUNK_BYTES, 60_000)).toBe(FIRST_CHUNK_BYTES / 2);
  });
});
