import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Upload a local file URI to Supabase Storage using native streaming.
 * Unlike readAsStringAsync (which loads the whole file into memory and
 * blocks the JS thread), FileSystem.uploadAsync streams the file natively.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  uri: string,
  mimeType: string,
): Promise<{ error: Error | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? SUPABASE_ANON_KEY;

  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': mimeType,
    },
  });

  if (result.status >= 400) {
    let msg = `Upload failed (${result.status})`;
    try { msg = JSON.parse(result.body)?.message ?? msg; } catch {}
    return { error: new Error(msg) };
  }
  return { error: null };
}
