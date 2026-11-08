// Edge Function: delete-account
// Sletter den innloggede brukerens data, filer i Storage og auth-bruker.
// Deploy: npx supabase functions deploy delete-account --project-ref <ref>
// SUPABASE_URL, SUPABASE_ANON_KEY og SUPABASE_SERVICE_ROLE_KEY settes automatisk av Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Ikke innlogget' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Finn brukeren ut fra tokenet appen sender med
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Ugyldig sesjon' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Slett data i databasen og hent filstier
  const { data: paths, error: rpcError } = await admin.rpc('delete_account_data', { p_uid: user.id });
  if (rpcError) {
    console.error('delete_account_data feilet', rpcError);
    return json({ error: 'Kunne ikke slette data' }, 500);
  }

  // 2. Slett filer i Storage (maks 100 per kall). Feil her stopper ikke slettingen.
  const files = (paths ?? []) as string[];
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from('documents').remove(files.slice(i, i + 100));
    if (error) console.error('Storage-sletting feilet', error);
  }

  // 3. Slett auth-brukeren (public.users slettes via ON DELETE CASCADE)
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('deleteUser feilet', deleteError);
    return json({ error: 'Kunne ikke slette brukeren' }, 500);
  }

  return json({ ok: true });
});
