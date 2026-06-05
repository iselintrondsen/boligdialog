/**
 * Tests for lib/uploadFile.ts
 *
 * We mock expo-file-system/legacy and the supabase client so tests
 * run without any native or network dependencies.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUploadAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: mockUploadAsync,
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
}));

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

// Expose env vars used by uploadFile
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// ─── Import under test (after mocks are registered) ──────────────────────────
import { uploadToStorage } from '../lib/uploadFile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionWith(token: string | null) {
  mockGetSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadToStorage', () => {
  it('calls FileSystem.uploadAsync with the correct URL and headers when a session exists', async () => {
    sessionWith('user-token-123');
    mockUploadAsync.mockResolvedValue({ status: 200, body: '{}' });

    const { error } = await uploadToStorage(
      'documents',
      'user-id/unit-id/file.pdf',
      'file:///tmp/file.pdf',
      'application/pdf',
    );

    expect(error).toBeNull();
    expect(mockUploadAsync).toHaveBeenCalledWith(
      'https://test.supabase.co/storage/v1/object/documents/user-id/unit-id/file.pdf',
      'file:///tmp/file.pdf',
      expect.objectContaining({
        httpMethod: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token-123',
          apikey: 'test-anon-key',
          'Content-Type': 'application/pdf',
        }),
      }),
    );
  });

  it('falls back to anon key when there is no active session', async () => {
    sessionWith(null);
    mockUploadAsync.mockResolvedValue({ status: 200, body: '{}' });

    await uploadToStorage('documents', 'path/file.jpg', 'file:///tmp/img.jpg', 'image/jpeg');

    const call = mockUploadAsync.mock.calls[0][2];
    expect(call.headers.Authorization).toBe('Bearer test-anon-key');
  });

  it('returns an error when the server responds with a 4xx status', async () => {
    sessionWith('token');
    mockUploadAsync.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ message: 'Bucket not found' }),
    });

    const { error } = await uploadToStorage('documents', 'x', 'file:///x', 'image/png');

    expect(error).not.toBeNull();
    expect(error!.message).toBe('Bucket not found');
  });

  it('returns a generic error message when the response body is not JSON', async () => {
    sessionWith('token');
    mockUploadAsync.mockResolvedValue({ status: 500, body: 'Internal Server Error' });

    const { error } = await uploadToStorage('documents', 'x', 'file:///x', 'image/png');

    expect(error).not.toBeNull();
    expect(error!.message).toContain('500');
  });

  it('propagates exceptions thrown by uploadAsync', async () => {
    sessionWith('token');
    mockUploadAsync.mockRejectedValue(new Error('Network error'));

    await expect(
      uploadToStorage('documents', 'x', 'file:///x', 'image/png'),
    ).rejects.toThrow('Network error');
  });
});
