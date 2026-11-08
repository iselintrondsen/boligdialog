/**
 * Tests for lib/uploadFile.ts — uses an XMLHttpRequest mock.
 */

// ─── XHR mock ─────────────────────────────────────────────────────────────────

class MockXHR {
  status = 0;
  responseText = '';
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private _headers: Record<string, string> = {};
  openArgs: unknown[] = [];
  sentBody: unknown = undefined;
  sendCalled = false;

  open(...args: unknown[]) { this.openArgs = args; }
  setRequestHeader(k: string, v: string) { this._headers[k] = v; }
  getHeader(k: string) { return this._headers[k]; }

  send(body: unknown) {
    this.sentBody = body;
    this.sendCalled = true;
    // Do NOT auto-fire — tests control when onload fires
  }

  /** Fire success/failure from the test after awaiting setup. */
  resolve(status = 200, body = '{}') {
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }

  reject() { this.onerror?.(); }
  expire() { this.ontimeout?.(); }
}

let lastXhr: MockXHR;
(globalThis as any).XMLHttpRequest = jest.fn(() => {
  lastXhr = new MockXHR();
  return lastXhr;
});

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { uploadToStorage } from '../lib/uploadFile';

// ─── Helper ───────────────────────────────────────────────────────────────────
function sessionWith(token: string | null) {
  mockGetSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

/** Yield long enough for getSession + subsequent sync code to run so XHR exists. */
async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

// ─── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => jest.clearAllMocks());

describe('uploadToStorage', () => {
  it('sends POST to the correct URL with auth headers', async () => {
    sessionWith('user-token-123');

    const promise = uploadToStorage(
      'documents', 'user/unit/file.pdf',
      'file:///tmp/file.pdf', 'application/pdf', 'file.pdf',
    );

    await flushAsync();                        // XHR now exists
    lastXhr.resolve(200);
    const { error } = await promise;

    expect(error).toBeNull();
    expect(lastXhr.openArgs[0]).toBe('POST');
    expect(lastXhr.openArgs[1]).toBe(
      'https://test.supabase.co/storage/v1/object/documents/user/unit/file.pdf',
    );
    expect(lastXhr.getHeader('Authorization')).toBe('Bearer user-token-123');
    expect(lastXhr.getHeader('apikey')).toBe('test-anon-key');
  });

  it('falls back to anon key when there is no session', async () => {
    sessionWith(null);
    const promise = uploadToStorage('documents', 'p', 'file:///f', 'image/jpeg', 'f.jpg');
    await flushAsync();
    lastXhr.resolve(200);
    await promise;
    expect(lastXhr.getHeader('Authorization')).toBe('Bearer test-anon-key');
  });

  it('returns an error when the server responds 4xx', async () => {
    sessionWith('tok');
    const promise = uploadToStorage('documents', 'x', 'file:///x', 'image/png', 'x.png');
    await flushAsync();
    lastXhr.resolve(400, JSON.stringify({ message: 'Bucket not found' }));
    const { error } = await promise;
    expect(error).not.toBeNull();
    expect(error!.message).toBe('Bucket not found');
  });

  it('returns a generic error when response body is not JSON', async () => {
    sessionWith('tok');
    const promise = uploadToStorage('documents', 'x', 'file:///x', 'image/png', 'x.png');
    await flushAsync();
    lastXhr.resolve(500, 'Internal Server Error');
    const { error } = await promise;
    expect(error).not.toBeNull();
    expect(error!.message).toContain('500');
  });

  it('sends a FormData body', async () => {
    sessionWith('tok');
    const promise = uploadToStorage('documents', 'x', 'file:///f.pdf', 'application/pdf', 'f.pdf');
    await flushAsync();
    lastXhr.resolve(200);
    await promise;
    expect(lastXhr.sentBody).toBeInstanceOf(FormData);
  });

  it('returns a network error on XHR failure', async () => {
    sessionWith('tok');
    const promise = uploadToStorage('documents', 'x', 'file:///x', 'image/png', 'x.png');
    await flushAsync();
    lastXhr.reject();
    const { error } = await promise;
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/nettverksfeil/i);
  });

  it('returns a timeout error on XHR timeout', async () => {
    sessionWith('tok');
    const promise = uploadToStorage('documents', 'x', 'file:///x', 'image/png', 'x.png');
    await flushAsync();
    lastXhr.expire();
    const { error } = await promise;
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/tid/i);
  });
});
