-- ============================================================================
-- Migrasjon 003: sletting av konto (påkrevd av Apple, App Store 5.1.1(v))
-- ----------------------------------------------------------------------------
-- Kjør hele denne i Supabase → SQL Editor. Idempotent.
--
-- delete_account_data(p_uid) rydder bort alle data knyttet til en bruker og
-- returnerer filstiene i Storage som skal slettes. Den kalles KUN fra Edge
-- Function "delete-account" (service_role), som deretter sletter filene og
-- selve auth-brukeren (public.users slettes via ON DELETE CASCADE).
--
-- Utleier: alle egne eiendommer slettes (og alt under dem via CASCADE).
-- Leietaker: kobles fra enheten; egne meldinger, feilmeldinger, leieforhold og
-- dokumenter slettes. Signerte rapporter beholdes hos utleier, men
-- tenant_signed_by settes til NULL.
--
-- Fremmednøkler mot public.users håndteres generisk: NOT NULL-kolonner -> rader
-- slettes, nullable kolonner -> settes til NULL. Da fungerer funksjonen også
-- om det er lagt til kolonner i databasen som ikke står i migrasjonsfilene.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_account_data(p_uid UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths TEXT[] := '{}';
  fk RECORD;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid mangler';
  END IF;

  -- 1. Samle filstier i Storage før radene forsvinner ------------------------
  SELECT v_paths || COALESCE(array_agg(d.storage_path), '{}') INTO v_paths
  FROM documents d
  JOIN units u      ON u.id = d.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.landlord_id = p_uid OR d.uploaded_by = p_uid;

  SELECT v_paths || COALESCE(array_agg(ph.storage_path), '{}') INTO v_paths
  FROM inspection_photos ph
  JOIN inspection_items i   ON i.id = ph.item_id
  JOIN inspection_reports r ON r.id = i.report_id
  JOIN units u              ON u.id = r.unit_id
  JOIN properties p         ON p.id = u.property_id
  WHERE p.landlord_id = p_uid OR r.landlord_id = p_uid;

  SELECT v_paths || COALESCE(array_agg(ii.storage_path), '{}') INTO v_paths
  FROM issue_images ii
  JOIN issues s     ON s.id = ii.issue_id
  JOIN units u      ON u.id = s.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE p.landlord_id = p_uid OR s.tenant_id = p_uid;

  -- 2. Utleier: slett egne eiendommer (CASCADE tar enheter og alt under) ----
  DELETE FROM properties WHERE landlord_id = p_uid;

  -- 3. Alle øvrige referanser til brukeren ----------------------------------
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col, a.attnotnull AS not_null
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND c.conrelid <> 'public.users'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF fk.not_null THEN
      EXECUTE format('DELETE FROM %s WHERE %I = $1', fk.tbl, fk.col) USING p_uid;
    ELSE
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', fk.tbl, fk.col, fk.col) USING p_uid;
    END IF;
  END LOOP;

  RETURN (
    SELECT COALESCE(array_agg(DISTINCT x), '{}')
    FROM unnest(v_paths) AS x
    WHERE x IS NOT NULL
  );
END;
$$;

-- Kun Edge Function (service_role) får kalle funksjonen
REVOKE ALL ON FUNCTION public.delete_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(UUID) TO service_role;
