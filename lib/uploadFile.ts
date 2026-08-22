import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Upload a local file URI to Supabase Storage using XMLHttpRequest.
 * XHR is the most reliable upload mechanism in React Native — it reads
 * the file natively without loading it into the JS heap, so the UI stays
 * responsive. FormData with { uri, name, type } is the standard RN pattern.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  uri: string,
  mimeType: string,
  fileName: string,
): Promise<{ error: Error | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? SUPABASE_ANON_KEY;

  return new Promise((resolve) => {
    const formData = new FormData();
    // React Native's XHR reads file:// URIs natively from the FormData object
    (formData as any).append('', { uri, name: fileName, type: mimeType });

    const xhr = new XMLHttpRequest();
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.timeout = 60_000;

    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Opplasting mislyktes (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.message ?? msg; } catch {}
        resolve({ error: new Error(msg) });
      } else {
        resolve({ error: null });
      }
    };

    xhr.onerror   = () => resolve({ error: new Error('Nettverksfeil under opplasting') });
    xhr.ontimeout = () => resolve({ error: new Error('Opplasting tok for lang tid — prøv igjen') });

    xhr.send(formData);
  });
}
