-- =========================================
-- MedFlow Guardian Sync Schema & RLS
-- =========================================
-- Purpose: Secure cloud sync for family caregivers
-- Guardians receive 1h+ missed-dose escalations via real-time Supabase subscriptions
-- RLS policies ensure guardians can ONLY read their linked patient codes

-- Table 1: Guardian Profiles (each user/device has a profile)
CREATE TABLE IF NOT EXISTS guardian_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  device_code TEXT UNIQUE NOT NULL, -- "MED-7429" - unique patient invite code
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Guardian Links (links between guardians and monitored patients)
CREATE TABLE IF NOT EXISTS guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code TEXT NOT NULL, -- "MED-7429" - the patient's device code
  relation TEXT NOT NULL DEFAULT 'Caregiver', -- "Mother", "Father", "Sibling", etc.
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guardian_user_id, patient_code)
);

-- Table 3: Dose Feed (all dose completions synced by patients)
CREATE TABLE IF NOT EXISTS guardian_dose_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code TEXT NOT NULL, -- Patient's device code (not user_id for privacy)
  med_name TEXT NOT NULL,
  med_strength TEXT NOT NULL,
  dose_qty TEXT NOT NULL, -- "1 tablet", "12 units"
  taken_at TEXT NOT NULL, -- "02:15 PM"
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 4: Guardian Alerts (1h+ missed-dose escalations)
CREATE TABLE IF NOT EXISTS guardian_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code TEXT NOT NULL, -- Patient's device code
  med_name TEXT NOT NULL,
  med_strength TEXT NOT NULL DEFAULT '',
  scheduled_time TEXT NOT NULL, -- "08:00 AM"
  overdue_minutes INTEGER NOT NULL DEFAULT 60, -- How many mins past window
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- Row Level Security (RLS) Policies
-- =========================================
-- Enable RLS on all guardian tables

ALTER TABLE guardian_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_dose_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_alerts ENABLE ROW LEVEL SECURITY;

-- Policy 1: Guardian Profiles - Only own profile accessible
CREATE POLICY "Users can view own profile"
  ON guardian_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON guardian_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Guardian Links - Only own links accessible
CREATE POLICY "Guardians can view own links"
  ON guardian_links FOR SELECT
  USING (guardian_user_id = auth.uid());

CREATE POLICY "Guardians can create links"
  ON guardian_links FOR INSERT
  WITH CHECK (guardian_user_id = auth.uid());

-- Policy 3: Dose Feed - Only linked patient data accessible
CREATE POLICY "Guardians can view linked patient doses"
  ON guardian_dose_feed FOR SELECT
  USING (
    patient_code IN (
      SELECT patient_code FROM guardian_links WHERE guardian_user_id = auth.uid()
    )
  );

-- Policy 4: Guardian Alerts - Only linked patient alerts accessible
CREATE POLICY "Guardians can view linked patient alerts"
  ON guardian_alerts FOR SELECT
  USING (
    patient_code IN (
      SELECT patient_code FROM guardian_links WHERE guardian_user_id = auth.uid()
    )
  );

CREATE POLICY "Guardians can acknowledge alerts"
  ON guardian_alerts FOR UPDATE
  USING (
    patient_code IN (
      SELECT patient_code FROM guardian_links WHERE guardian_user_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_code IN (
      SELECT patient_code FROM guardian_links WHERE guardian_user_id = auth.uid()
    )
  );

-- =========================================
-- Indexes for Performance
-- =========================================

CREATE INDEX idx_guardian_profiles_device_code ON guardian_profiles(device_code);
CREATE INDEX idx_guardian_links_patient_code ON guardian_links(patient_code);
CREATE INDEX idx_guardian_links_guardian_user_id ON guardian_links(guardian_user_id);
CREATE INDEX idx_guardian_dose_feed_patient_code ON guardian_dose_feed(patient_code);
CREATE INDEX idx_guardian_dose_feed_created_at ON guardian_dose_feed(created_at DESC);
CREATE INDEX idx_guardian_alerts_patient_code ON guardian_alerts(patient_code);
CREATE INDEX idx_guardian_alerts_acknowledged ON guardian_alerts(acknowledged);
CREATE INDEX idx_guardian_alerts_created_at ON guardian_alerts(created_at DESC);

-- =========================================
-- Materialized View: Patient Adherence
-- =========================================
-- Tracks adherence % for a given patient code over last 7 days
CREATE MATERIALIZED VIEW patient_adherence_7d AS
SELECT
  patient_code,
  COUNT(*) as total_expected_doses,
  COUNT(CASE WHEN logged_at IS NOT NULL THEN 1 END) as doses_taken,
  ROUND(
    100.0 * COUNT(CASE WHEN logged_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0)
  ) as adherence_percent,
  MAX(logged_at) as last_dose_logged
FROM guardian_dose_feed
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY patient_code;

CREATE INDEX idx_patient_adherence_code ON patient_adherence_7d(patient_code);

-- =========================================
-- Stored Functions (Optional)
-- =========================================

-- Function to automatically generate unique patient invite codes
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TEXT AS $$
BEGIN
  LOOP
    -- Generate "MED-XXXX" format (4 random digits)
    DECLARE code TEXT := 'MED-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    BEGIN
      PERFORM 1 FROM guardian_profiles WHERE device_code = code LIMIT 1;
      IF NOT FOUND THEN
        RETURN code;
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Comments (Documentation)
-- =========================================

COMMENT ON TABLE guardian_profiles IS 'Patient device profiles with unique invite codes';
COMMENT ON TABLE guardian_links IS 'Links between guardians and monitored patients';
COMMENT ON TABLE guardian_dose_feed IS 'Real-time dose completion feed for linked guardians';
COMMENT ON TABLE guardian_alerts IS '1h+ missed-dose escalations (created by patient app)';
COMMENT ON COLUMN guardian_links.patient_code IS 'Patient device code (e.g., MED-7429) - stored instead of user_id for privacy';
COMMENT ON COLUMN guardian_alerts.overdue_minutes IS 'Minutes past scheduled window (e.g., 60 = 1h overdue)';
