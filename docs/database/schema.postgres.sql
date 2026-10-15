-- CEP Tumba College Association Management System
-- Database schema draft (PostgreSQL)
-- Source: derived from frontend models in frontend/src/data/*Store.ts
-- Date: 2026-04-20

-- Notes
-- - Uses UUID primary keys and snake_case naming.
-- - Stores both *_id references and *_name snapshots where the UI currently uses plain strings.
-- - Amounts are stored in RWF as integers (no decimals).

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email

-- ---------- Enums ----------

CREATE TYPE app_role AS ENUM (
  'president',
  'vp_prayers',
  'vp_social',
  'advisor_prayers',
  'advisor_social',
  'accountant',
  'secretary',
  'member'
);

CREATE TYPE member_status AS ENUM ('active', 'inactive', 'graduated', 'suspended');

CREATE TYPE announcement_category AS ENUM ('urgent', 'spiritual', 'finance', 'social', 'academic', 'general');
CREATE TYPE announcement_status AS ENUM ('draft', 'scheduled', 'published', 'archived');

CREATE TYPE leadership_term_status AS ENUM ('upcoming', 'active', 'completed');

CREATE TYPE event_type AS ENUM ('prayer', 'study', 'service', 'social', 'outreach', 'meeting');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent');
CREATE TYPE attendance_method AS ENUM ('manual', 'qr', 'self');

CREATE TYPE finance_fund_id AS ENUM ('welfare', 'evangelism', 'social', 'project', 'tithe', 'savings');
CREATE TYPE ui_color AS ENUM ('primary', 'success', 'accent', 'info', 'warning', 'destructive');
CREATE TYPE finance_tx_type AS ENUM (
  'offering',
  'tithe',
  'contribution',
  'savings_deposit',
  'savings_withdraw',
  'expense',
  'other_income'
);
CREATE TYPE finance_tx_status AS ENUM ('approved', 'pending', 'rejected');
CREATE TYPE finance_tx_direction AS ENUM ('in', 'out');
CREATE TYPE finance_payment_method AS ENUM ('cash', 'mpesa', 'bank', 'card', 'other');

CREATE TYPE minute_meeting_type AS ENUM ('executive', 'general', 'advisors', 'committee', 'agm');
CREATE TYPE minute_status AS ENUM ('draft', 'circulated', 'approved');
CREATE TYPE minute_participant_kind AS ENUM ('attendee', 'apology');

CREATE TYPE resolution_status AS ENUM ('proposed', 'passed', 'rejected', 'tabled');

CREATE TYPE document_category AS ENUM ('constitution', 'handover', 'policy', 'report', 'sermon', 'form', 'other');

CREATE TYPE devotion_status AS ENUM ('draft', 'scheduled', 'published');
CREATE TYPE reaction_kind AS ENUM ('amen', 'pray', 'love', 'fire');

CREATE TYPE follow_up_status AS ENUM ('new', 'assigned', 'in_progress', 'closed');

CREATE TYPE welfare_case_type AS ENUM ('illness', 'bereavement', 'financial', 'academic', 'spiritual', 'celebration', 'other');
CREATE TYPE welfare_case_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE welfare_urgency AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE welfare_visit_status AS ENUM ('planned', 'completed', 'cancelled');

CREATE TYPE association_request_type AS ENUM (
  'prayer_support',
  'financial_aid',
  'welfare_help',
  'budget_request',
  'event_approval',
  'reimbursement',
  'leader_apology',
  'savings_withdrawal'
);
CREATE TYPE association_request_status AS ENUM ('pending', 'in_review', 'approved', 'rejected');

-- ---------- Core identity ----------

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email citext UNIQUE,
  phone text,
  department text,
  year_of_study text,
  fellowship text,
  status member_status NOT NULL DEFAULT 'active',
  joined_at date,
  baptized boolean NOT NULL DEFAULT false,
  avatar_hue smallint NOT NULL DEFAULT 0 CHECK (avatar_hue >= 0 AND avatar_hue < 360),
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  display_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  member_id uuid UNIQUE REFERENCES members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  refresh_token_hash text,
  refresh_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Announcements ----------

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category announcement_category NOT NULL DEFAULT 'general',
  status announcement_status NOT NULL DEFAULT 'published',
  scheduled_for timestamptz,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX announcements_created_at_idx ON announcements (created_at DESC);
CREATE INDEX announcements_category_idx ON announcements (category);
CREATE INDEX announcements_status_idx ON announcements (status);

-- ---------- Leadership & alumni ----------

CREATE TABLE leadership_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  holder_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  holder_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status leadership_term_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadership_terms_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT leadership_terms_holder_chk CHECK (holder_member_id IS NOT NULL OR length(trim(holder_name)) > 0)
);

CREATE INDEX leadership_terms_status_idx ON leadership_terms (status);
CREATE INDEX leadership_terms_role_idx ON leadership_terms (role);

CREATE TABLE committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  lead_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  lead_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE committee_members (
  committee_id uuid NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (committee_id, member_id)
);

CREATE TABLE handover_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  from_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  from_leader_name text NOT NULL,
  to_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  to_leader_name text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alumni_profiles (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  graduation_year integer NOT NULL,
  current_role_title text,
  mentor_available boolean NOT NULL DEFAULT false,
  last_engagement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Events & attendance ----------

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type event_type NOT NULL,
  description text,
  location text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  speaker text,
  recurring boolean NOT NULL DEFAULT false,
  weekday smallint CHECK (weekday >= 0 AND weekday <= 6),
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_time_chk CHECK (end_time > start_time),
  CONSTRAINT events_recur_weekday_chk CHECK ((recurring AND weekday IS NOT NULL) OR (NOT recurring AND weekday IS NULL)),
  CONSTRAINT events_end_date_chk CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX events_type_idx ON events (type);
CREATE INDEX events_start_date_idx ON events (start_date);

CREATE TABLE event_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, occurrence_date)
);

CREATE INDEX event_occurrences_date_idx ON event_occurrences (occurrence_date);

CREATE TABLE event_attendance (
  occurrence_id uuid NOT NULL REFERENCES event_occurrences(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status attendance_status NOT NULL,
  method attendance_method NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (occurrence_id, member_id)
);

CREATE INDEX event_attendance_member_idx ON event_attendance (member_id);
CREATE INDEX event_attendance_status_idx ON event_attendance (status);

CREATE TABLE event_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  mime_type text NOT NULL,
  storage_key text,
  url text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX event_materials_event_idx ON event_materials (event_id);

-- ---------- Finance ----------

CREATE TABLE funds (
  id finance_fund_id PRIMARY KEY,
  name text NOT NULL,
  color ui_color NOT NULL,
  description text NOT NULL
);

CREATE TABLE finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date date NOT NULL,
  type finance_tx_type NOT NULL,
  fund_id finance_fund_id NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  amount_rwf bigint NOT NULL CHECK (amount_rwf > 0),
  direction finance_tx_direction NOT NULL,
  description text NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  status finance_tx_status NOT NULL DEFAULT 'approved',
  recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name text,
  payment_method finance_payment_method NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX finance_transactions_date_idx ON finance_transactions (tx_date DESC);
CREATE INDEX finance_transactions_fund_idx ON finance_transactions (fund_id);
CREATE INDEX finance_transactions_member_idx ON finance_transactions (member_id);
CREATE INDEX finance_transactions_status_idx ON finance_transactions (status);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,  -- e.g. "2026-Q2" or "2026-04" or "2026"
  label text NOT NULL,   -- e.g. "Q2 2026"
  fund_id finance_fund_id NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  category text NOT NULL,
  budgeted_rwf bigint NOT NULL CHECK (budgeted_rwf >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, fund_id, category)
);

CREATE INDEX budgets_period_idx ON budgets (period);
CREATE INDEX budgets_fund_idx ON budgets (fund_id);

-- ---------- Minutes & documents ----------

CREATE TABLE minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  meeting_type minute_meeting_type NOT NULL,
  meeting_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text NOT NULL,
  chair_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  chair_name text NOT NULL,
  secretary_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  secretary_name text NOT NULL,
  status minute_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minutes_time_chk CHECK (end_time > start_time)
);

CREATE INDEX minutes_meeting_date_idx ON minutes (meeting_date DESC);
CREATE INDEX minutes_status_idx ON minutes (status);

CREATE TABLE minute_participants (
  minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  kind minute_participant_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (minute_id, member_id)
);

CREATE INDEX minute_participants_kind_idx ON minute_participants (kind);

CREATE TABLE minute_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text NOT NULL,
  presenter text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX minute_agenda_minute_idx ON minute_agenda_items (minute_id);

CREATE TABLE minute_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  text text NOT NULL,
  moved_by text NOT NULL,
  seconded_by text NOT NULL,
  status resolution_status NOT NULL DEFAULT 'proposed',
  votes_for integer,
  votes_against integer,
  votes_abstain integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX minute_resolutions_minute_idx ON minute_resolutions (minute_id);

CREATE TABLE minute_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  task text NOT NULL,
  owner_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  owner_text text,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minute_action_owner_chk CHECK (owner_member_id IS NOT NULL OR owner_text IS NOT NULL)
);

CREATE INDEX minute_actions_minute_idx ON minute_action_items (minute_id);
CREATE INDEX minute_actions_done_idx ON minute_action_items (done);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category document_category NOT NULL,
  description text NOT NULL,
  owner_role app_role,
  owner_role_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_category_idx ON documents (category);

CREATE TABLE document_tags (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (document_id, tag)
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name text,
  change_note text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  mime_type text NOT NULL,
  storage_key text,
  url text,
  UNIQUE (document_id, version_label)
);

CREATE INDEX document_versions_document_idx ON document_versions (document_id);

-- ---------- Devotions ----------

CREATE TABLE devotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  reference text NOT NULL,
  verse text NOT NULL,
  reflection text,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text,
  scheduled_for date NOT NULL,
  status devotion_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devotions_scheduled_for_idx ON devotions (scheduled_for DESC);
CREATE INDEX devotions_status_idx ON devotions (status);

CREATE TABLE devotion_prayer_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devotion_id uuid NOT NULL REFERENCES devotions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  body text NOT NULL,
  UNIQUE (devotion_id, sort_order)
);

CREATE TABLE devotion_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devotion_id uuid NOT NULL REFERENCES devotions(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devotion_comments_devotion_idx ON devotion_comments (devotion_id);

CREATE TABLE devotion_reactions (
  devotion_id uuid NOT NULL REFERENCES devotions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind reaction_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (devotion_id, user_id, kind)
);

CREATE INDEX devotion_reactions_kind_idx ON devotion_reactions (kind);

-- ---------- Prayer center ----------

CREATE TABLE prayer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_name text,
  title text NOT NULL,
  message text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  status follow_up_status NOT NULL DEFAULT 'new',
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prayer_requests_status_idx ON prayer_requests (status);
CREATE INDEX prayer_requests_created_at_idx ON prayer_requests (created_at DESC);

CREATE TABLE counseling_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_name text,
  summary text NOT NULL,
  preferred_date date,
  status follow_up_status NOT NULL DEFAULT 'new',
  counselor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX counseling_requests_status_idx ON counseling_requests (status);

CREATE TABLE testimonies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX testimonies_created_at_idx ON testimonies (created_at DESC);

-- ---------- Welfare ----------

CREATE TABLE welfare_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  type welfare_case_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  urgency welfare_urgency NOT NULL DEFAULT 'medium',
  status welfare_case_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_by_name text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX welfare_cases_status_idx ON welfare_cases (status);
CREATE INDEX welfare_cases_member_idx ON welfare_cases (member_id);

CREATE TABLE welfare_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES welfare_cases(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX welfare_case_notes_case_idx ON welfare_case_notes (case_id);

CREATE TABLE welfare_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES welfare_cases(id) ON DELETE SET NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  scheduled_for timestamptz NOT NULL,
  location text NOT NULL,
  purpose text NOT NULL,
  status welfare_visit_status NOT NULL DEFAULT 'planned',
  report text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX welfare_visits_scheduled_for_idx ON welfare_visits (scheduled_for DESC);
CREATE INDEX welfare_visits_member_idx ON welfare_visits (member_id);

CREATE TABLE welfare_visit_assignees (
  visit_id uuid NOT NULL REFERENCES welfare_visits(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  PRIMARY KEY (visit_id, member_id)
);

CREATE TABLE welfare_visit_attendees (
  visit_id uuid NOT NULL REFERENCES welfare_visits(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  PRIMARY KEY (visit_id, member_id)
);

-- ---------- Requests & approvals ----------

CREATE TABLE association_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type association_request_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_name text,
  requester_role app_role,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  amount_rwf bigint,
  member_savings_balance_rwf bigint,
  status association_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text
);

CREATE INDEX association_requests_status_idx ON association_requests (status);
CREATE INDEX association_requests_created_at_idx ON association_requests (created_at DESC);
CREATE INDEX association_requests_member_idx ON association_requests (member_id);
CREATE INDEX association_requests_type_idx ON association_requests (type);

-- ---------- Auth migration for existing databases ----------

ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

-- ---------- Optional reference data seeds ----------

INSERT INTO funds (id, name, color, description) VALUES
  ('welfare',    'Welfare',    'success',     'Member care, hospital visits, bereavement'),
  ('evangelism', 'Evangelism', 'primary',     'Outreach, missions, tracts, transport'),
  ('social',     'Social',     'accent',      'Fellowships, retreats, hospitality'),
  ('project',    'Project',    'info',        'Capital projects & equipment'),
  ('tithe',      'Tithes',     'warning',     'Tithes contributions'),
  ('savings',    'Savings',    'primary',     'Member savings pool')
ON CONFLICT (id) DO NOTHING;
