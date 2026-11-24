-- MedFlow Guardian sync: explicit patient approval is required.
-- This migration is additive and never deletes patient or Guardian data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS guardian_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code TEXT NOT NULL UNIQUE,
  display_name TEXT DEFAULT '',
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code TEXT NOT NULL,
  guardian_code TEXT NOT NULL,
  guardian_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guardian_user_id, patient_code),
  CHECK (patient_user_id <> guardian_user_id)
);

CREATE TABLE IF NOT EXISTS guardian_dose_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT,
  patient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  med_name TEXT NOT NULL,
  dose_qty TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  status TEXT NOT NULL,
  adherence_pct NUMERIC(5, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  med_name TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  overdue_by TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

-- Existing early prototypes used device_code/patient_code-only columns.
-- Add the live columns without dropping or rewriting legacy records.
ALTER TABLE guardian_profiles
  ADD COLUMN IF NOT EXISTS patient_code TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE guardian_links
  ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS guardian_code TEXT,
  ADD COLUMN IF NOT EXISTS guardian_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE guardian_dose_feed
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scheduled_time TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS adherence_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE guardian_dose_feed
  DROP CONSTRAINT IF EXISTS guardian_dose_feed_status_check;
UPDATE guardian_dose_feed
SET status = CASE
  WHEN status = 'taken' THEN 'taken'
  WHEN status IN ('missed', 'missed_1h', 'overdue') THEN 'missed_1h'
  ELSE 'upcoming'
END;
ALTER TABLE guardian_dose_feed
  ADD CONSTRAINT guardian_dose_feed_status_check
  CHECK (status IN ('taken', 'upcoming', 'missed_1h'));

ALTER TABLE guardian_alerts
  ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS patient_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS overdue_by TEXT;

UPDATE guardian_links SET status = 'pending' WHERE status IS NULL;
UPDATE guardian_links SET guardian_name = '' WHERE guardian_name IS NULL;
UPDATE guardian_links SET guardian_code = '' WHERE guardian_code IS NULL;

ALTER TABLE guardian_links
  DROP CONSTRAINT IF EXISTS guardian_links_status_check;
ALTER TABLE guardian_links
  ADD CONSTRAINT guardian_links_status_check
  CHECK (status IN ('pending', 'approved', 'revoked'));

CREATE INDEX IF NOT EXISTS guardian_links_patient_pending_idx
  ON guardian_links(patient_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS guardian_links_guardian_approved_idx
  ON guardian_links(guardian_user_id) WHERE status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS guardian_links_guardian_patient_unique_idx
  ON guardian_links(guardian_user_id, patient_code);
CREATE INDEX IF NOT EXISTS guardian_dose_feed_patient_idx
  ON guardian_dose_feed(patient_user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_dose_feed_patient_source_unique
  ON guardian_dose_feed(patient_user_id, source_key);
CREATE INDEX IF NOT EXISTS guardian_alerts_patient_idx
  ON guardian_alerts(patient_user_id);

ALTER TABLE guardian_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_dose_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON guardian_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON guardian_profiles;
DROP POLICY IF EXISTS "Guardian Profiles select own" ON guardian_profiles;
DROP POLICY IF EXISTS "Guardian Profiles insert own" ON guardian_profiles;
DROP POLICY IF EXISTS "Guardian Profiles update own" ON guardian_profiles;
CREATE POLICY "Guardian Profiles select own"
  ON guardian_profiles FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Guardian Profiles insert own"
  ON guardian_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Guardian Profiles update own"
  ON guardian_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.register_guardian_profile(
  requested_patient_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  registered guardian_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF requested_patient_code !~ '^MED-[A-HJ-NP-Z2-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid patient code';
  END IF;

  INSERT INTO guardian_profiles (
    user_id,
    patient_code,
    display_name,
    sync_enabled
  )
  VALUES (
    auth.uid(),
    upper(requested_patient_code),
    '',
    TRUE
  )
  ON CONFLICT (user_id) DO UPDATE
  SET patient_code = guardian_profiles.patient_code
  RETURNING * INTO registered;

  RETURN jsonb_build_object(
    'user_id', registered.user_id,
    'patient_code', registered.patient_code,
    'display_name', registered.display_name,
    'sync_enabled', registered.sync_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_guardian_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_guardian_profile(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Guardians can view own links" ON guardian_links;
DROP POLICY IF EXISTS "Guardians can create links" ON guardian_links;
DROP POLICY IF EXISTS "Guardian Links select participants" ON guardian_links;
DROP POLICY IF EXISTS "Guardian Links insert pending" ON guardian_links;
DROP POLICY IF EXISTS "Guardian Links owner approve" ON guardian_links;
DROP POLICY IF EXISTS "Guardian Links participant revoke" ON guardian_links;
CREATE POLICY "Guardian Links select participants"
  ON guardian_links FOR SELECT
  USING (guardian_user_id = auth.uid() OR patient_user_id = auth.uid());
CREATE POLICY "Guardian Links insert pending"
  ON guardian_links FOR INSERT
  WITH CHECK (
    guardian_user_id = auth.uid()
    AND patient_user_id <> auth.uid()
    AND status = 'pending'
  );
CREATE POLICY "Guardian Links owner approve"
  ON guardian_links FOR UPDATE
  USING (patient_user_id = auth.uid())
  WITH CHECK (
    patient_user_id = auth.uid()
    AND status IN ('approved', 'revoked')
  );
CREATE POLICY "Guardian Links participant revoke"
  ON guardian_links FOR DELETE
  USING (guardian_user_id = auth.uid() OR patient_user_id = auth.uid());

REVOKE UPDATE ON guardian_links FROM authenticated;
GRANT UPDATE (status) ON guardian_links TO authenticated;

DROP POLICY IF EXISTS "Guardians can view linked patient doses" ON guardian_dose_feed;
DROP POLICY IF EXISTS "Guardian Dose patient write" ON guardian_dose_feed;
DROP POLICY IF EXISTS "Guardian Dose approved read" ON guardian_dose_feed;
CREATE POLICY "Guardian Dose patient write"
  ON guardian_dose_feed FOR INSERT
  WITH CHECK (patient_user_id = auth.uid());
DROP POLICY IF EXISTS "Guardian Dose patient update" ON guardian_dose_feed;
CREATE POLICY "Guardian Dose patient update"
  ON guardian_dose_feed FOR UPDATE
  USING (patient_user_id = auth.uid())
  WITH CHECK (patient_user_id = auth.uid());
DROP POLICY IF EXISTS "Guardian Dose patient delete" ON guardian_dose_feed;
CREATE POLICY "Guardian Dose patient delete"
  ON guardian_dose_feed FOR DELETE
  USING (patient_user_id = auth.uid());
CREATE POLICY "Guardian Dose approved read"
  ON guardian_dose_feed FOR SELECT
  USING (
    patient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM guardian_links
      WHERE guardian_links.patient_user_id = guardian_dose_feed.patient_user_id
        AND guardian_links.guardian_user_id = auth.uid()
        AND guardian_links.status = 'approved'
    )
  );

CREATE OR REPLACE FUNCTION public.guardian_profile_summaries(
  requested_user_ids UUID[]
)
RETURNS TABLE (
  user_id UUID,
  patient_code TEXT,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT profiles.user_id, profiles.patient_code, profiles.display_name
  FROM guardian_profiles profiles
  WHERE profiles.user_id = ANY(requested_user_ids)
    AND (
      profiles.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM guardian_links links
        WHERE (
          links.patient_user_id = profiles.user_id
          AND links.guardian_user_id = auth.uid()
          AND links.status IN ('pending', 'approved')
        )
        OR (
          links.patient_user_id = auth.uid()
          AND links.guardian_user_id = profiles.user_id
          AND links.status IN ('pending', 'approved')
        )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_profile_summaries(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardian_profile_summaries(UUID[]) TO authenticated;

DROP POLICY IF EXISTS "Guardians can view linked patient alerts" ON guardian_alerts;
DROP POLICY IF EXISTS "Guardians can acknowledge alerts" ON guardian_alerts;
DROP POLICY IF EXISTS "Guardian Alerts patient write" ON guardian_alerts;
DROP POLICY IF EXISTS "Guardian Alerts approved read" ON guardian_alerts;
DROP POLICY IF EXISTS "Guardian Alerts approved update" ON guardian_alerts;
CREATE POLICY "Guardian Alerts patient write"
  ON guardian_alerts FOR INSERT
  WITH CHECK (patient_user_id = auth.uid());
CREATE POLICY "Guardian Alerts approved read"
  ON guardian_alerts FOR SELECT
  USING (
    patient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM guardian_links
      WHERE guardian_links.patient_user_id = guardian_alerts.patient_user_id
        AND guardian_links.guardian_user_id = auth.uid()
        AND guardian_links.status = 'approved'
    )
  );
CREATE POLICY "Guardian Alerts approved update"
  ON guardian_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM guardian_links
      WHERE guardian_links.patient_user_id = guardian_alerts.patient_user_id
        AND guardian_links.guardian_user_id = auth.uid()
        AND guardian_links.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardian_links
      WHERE guardian_links.patient_user_id = guardian_alerts.patient_user_id
        AND guardian_links.guardian_user_id = auth.uid()
        AND guardian_links.status = 'approved'
    )
  );

REVOKE UPDATE ON guardian_alerts FROM authenticated;
GRANT UPDATE (acknowledged) ON guardian_alerts TO authenticated;

-- A code lookup never exposes the guardian_profiles row to a requester.
-- This function resolves the code and inserts the pending link server-side.
CREATE OR REPLACE FUNCTION public.request_guardian_access(
  target_patient_code TEXT,
  requested_guardian_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient UUID;
  patient_display_name TEXT;
  guardian_profile guardian_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT user_id, coalesce(nullif(display_name, ''), patient_code)
  INTO patient, patient_display_name
  FROM guardian_profiles
  WHERE patient_code = upper(trim(target_patient_code));
  IF patient IS NULL THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;
  IF patient = auth.uid() THEN
    RAISE EXCEPTION 'Cannot request access to own patient code';
  END IF;

  SELECT * INTO guardian_profile
  FROM guardian_profiles
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guardian profile required';
  END IF;

  INSERT INTO guardian_links (
    patient_user_id,
    guardian_user_id,
    patient_code,
    guardian_code,
    guardian_name,
    status
  )
  VALUES (
    patient,
    auth.uid(),
    upper(trim(target_patient_code)),
    guardian_profile.patient_code,
    left(trim(requested_guardian_name), 80),
    'pending'
  )
  ON CONFLICT (guardian_user_id, patient_code)
  DO UPDATE SET
    patient_user_id = EXCLUDED.patient_user_id,
    guardian_code = EXCLUDED.guardian_code,
    guardian_name = EXCLUDED.guardian_name,
    status = 'pending'
  WHERE guardian_links.status <> 'approved';

  RETURN jsonb_build_object(
    'found', EXISTS (
    SELECT 1
    FROM guardian_links
    WHERE guardian_user_id = auth.uid()
      AND patient_code = upper(trim(target_patient_code))
      AND status = 'pending'
    ),
    'patient_name', patient_display_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_guardian_access(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_guardian_access(TEXT, TEXT) TO authenticated;

-- The old materialized adherence view must not bypass row-level policies.
DO $$
BEGIN
  IF to_regclass('public.patient_adherence_7d') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON patient_adherence_7d FROM anon, authenticated';
  END IF;
END;
$$;
