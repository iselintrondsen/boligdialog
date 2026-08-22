-- ============================================================================
-- Migrasjon 002: leases-tabell + leietaker-kobling
-- ----------------------------------------------------------------------------
-- Kjør hele denne i Supabase → SQL Editor.
-- Idempotent: trygg å kjøre flere ganger (IF NOT EXISTS / EXCEPTION-blokker).
-- ============================================================================

-- 1. LEASES-TABELL ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.users(id),
  started_at  DATE NOT NULL,
  ended_at    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

-- Indeks for raskt oppslag per enhet
CREATE INDEX IF NOT EXISTS idx_leases_unit_id   ON public.leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON public.leases(tenant_id);

-- Leietaker kan se sine egne leieforhold
DO $$ BEGIN
  CREATE POLICY "Leietaker ser egne leieforhold" ON public.leases
    FOR SELECT USING (tenant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Leietaker kan opprette sitt eget leieforhold (ved kobling)
DO $$ BEGIN
  CREATE POLICY "Leietaker oppretter eget leieforhold" ON public.leases
    FOR INSERT WITH CHECK (tenant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Utleier kan se og administrere leieforhold på sine enheter
DO $$ BEGIN
  CREATE POLICY "Utleier administrerer leieforhold" ON public.leases
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.units u
        JOIN public.properties p ON p.id = u.property_id
        WHERE u.id = unit_id AND p.landlord_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. LEIETAKER-KOBLING TIL ENHET --------------------------------------------
-- Lar en leietaker sette tenant_id på en ledig enhet, men KUN hvis det finnes
-- en gyldig (pending, ikke utløpt) invitasjon til leietakerens egen e-post.
DO $$ BEGIN
  CREATE POLICY "Leietaker kan koble seg til enhet via invitasjon" ON public.units
    FOR UPDATE
    USING (
      tenant_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.invitations i
        JOIN public.users u ON u.id = auth.uid()
        WHERE i.unit_id = units.id
          AND i.email   = u.email
          AND i.status  = 'pending'
          AND i.expires_at > NOW()
      )
    )
    WITH CHECK (tenant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Ferdig. Leietaker kan nå skrive inn 6-sifret kode og kobles til enheten.
-- ============================================================================
