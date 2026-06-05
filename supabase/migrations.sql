-- Bolig Dialog database migrations
-- Kjør i Supabase SQL Editor i riktig rekkefølge

-- 1. Brukerprofiler (kobles til Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('landlord', 'tenant')),
  avatar_url TEXT,
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Bruker kan lese eget profil" ON public.users
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Bruker kan oppdatere eget profil" ON public.users
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Bruker kan opprette eget profil" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Eiendommer
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan se egne eiendommer" ON public.properties
    FOR SELECT USING (auth.uid() = landlord_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Utleier kan opprette eiendommer" ON public.properties
    FOR INSERT WITH CHECK (auth.uid() = landlord_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Utleier kan oppdatere egne eiendommer" ON public.properties
    FOR UPDATE USING (auth.uid() = landlord_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Enheter
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  floor INTEGER,
  size_sqm NUMERIC(6,2),
  monthly_rent NUMERIC(10,2),
  tenant_id UUID REFERENCES public.users(id),
  lease_start DATE,
  lease_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan administrere egne enheter" ON public.units
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id = property_id AND p.landlord_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan se sin enhet" ON public.units
    FOR SELECT USING (tenant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Funksjon for å sjekke leietakers enhet uten RLS-rekursjon
CREATE OR REPLACE FUNCTION public.tenant_has_unit_in_property(prop_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units
    WHERE property_id = prop_id AND tenant_id = auth.uid()
  );
$$;

-- Leietaker kan se property for sin enhet (etter units-tabellen)
DO $$ BEGIN
  CREATE POLICY "Leietaker kan se property for sin enhet" ON public.properties
    FOR SELECT USING (
      public.tenant_has_unit_in_property(id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Invitasjoner
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES public.users(id),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan administrere egne invitasjoner" ON public.invitations
    FOR ALL USING (landlord_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan lese invitasjon på sin epost" ON public.invitations
    FOR SELECT USING (
      email = (SELECT email FROM public.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan oppdatere invitasjon på sin epost" ON public.invitations
    FOR UPDATE USING (
      email = (SELECT email FROM public.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Feilmeldinger
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'windows_doors', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan opprette og lese egne feilmeldinger" ON public.issues
    FOR ALL USING (tenant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Utleier kan lese og oppdatere feilmeldinger for sine enheter" ON public.issues
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.units u
        JOIN public.properties p ON p.id = u.property_id
        WHERE u.id = unit_id AND p.landlord_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-oppdater updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER issues_updated_at
    BEFORE UPDATE ON public.issues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Bilder på feilmeldinger
CREATE TABLE IF NOT EXISTS public.issue_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.issue_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Tilgang via issue-tilgang" ON public.issue_images
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.issues i WHERE i.id = issue_id
        AND (i.tenant_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.units u
          JOIN public.properties p ON p.id = u.property_id
          WHERE u.id = i.unit_id AND p.landlord_id = auth.uid()
        ))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Meldinger
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  image_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Tilgang til meldinger i sin enhet" ON public.messages
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = unit_id
        AND (u.tenant_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.properties p
          WHERE p.id = u.property_id AND p.landlord_id = auth.uid()
        ))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. Dokumenter
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('contract', 'rules', 'receipt', 'other')),
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Tilgang til dokumenter i sin enhet" ON public.documents
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = unit_id
        AND (u.tenant_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.properties p
          WHERE p.id = u.property_id AND p.landlord_id = auth.uid()
        ))
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = unit_id
        AND (u.tenant_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.properties p
          WHERE p.id = u.property_id AND p.landlord_id = auth.uid()
        ))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. Varsler
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan administrere varsler" ON public.announcements
    FOR ALL USING (landlord_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tenant_can_see_announcement(prop_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units
    WHERE property_id = prop_id AND tenant_id = auth.uid()
  );
$$;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan se varsler for sin eiendom" ON public.announcements
    FOR SELECT USING (public.tenant_can_see_announcement(property_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. Utgifter (kun tilgjengelig for utleier)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES public.users(id),
  amount NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('maintenance', 'repair', 'utilities', 'insurance', 'tax', 'other')),
  description TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan administrere egne utgifter" ON public.expenses
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.units u
        JOIN public.properties p ON p.id = u.property_id
        WHERE u.id = unit_id AND p.landlord_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. Innflyttings- og utflyttingsrapporter
CREATE TABLE IF NOT EXISTS public.inspection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES public.users(id),
  type TEXT NOT NULL CHECK (type IN ('move_in', 'move_out')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_signature', 'signed')),
  notes TEXT,
  tenant_signed_at TIMESTAMPTZ,
  tenant_signed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Utleier kan administrere egne rapporter" ON public.inspection_reports
    FOR ALL USING (landlord_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Leietaker kan lese og signere rapport for sin enhet" ON public.inspection_reports
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.units WHERE id = unit_id AND tenant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.inspection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.inspection_reports(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('kitchen', 'bathroom', 'floors', 'walls', 'other')),
  condition TEXT CHECK (condition IN ('good', 'fair', 'poor')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Tilgang til items via rapport" ON public.inspection_items
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.inspection_reports r
        WHERE r.id = report_id
        AND (r.landlord_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.units WHERE id = r.unit_id AND tenant_id = auth.uid()
        ))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inspection_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Tilgang til bilder via item" ON public.inspection_photos
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.inspection_items i
        JOIN public.inspection_reports r ON r.id = i.report_id
        WHERE i.id = item_id
        AND (r.landlord_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.units WHERE id = r.unit_id AND tenant_id = auth.uid()
        ))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage bucket for documents (kjør i Supabase Dashboard → Storage)
-- Bucket name: "documents", public: false
-- Storage policies (kjør i SQL Editor):
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Autentiserte brukere kan laste opp dokumenter"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Autentiserte brukere kan lese dokumenter"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Autentiserte brukere kan slette egne dokumenter"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
