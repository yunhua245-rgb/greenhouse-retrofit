-- ============================================================
-- Greenhouse-Retrofit: Supabase Backend Migration
-- Run this in Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Projects
-- ============================================================
CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,          -- 'greenhouse' | 'modu'
  name          TEXT NOT NULL,                 -- 项目中文名
  name_en       TEXT,                          -- 项目英文名
  theme_color   TEXT DEFAULT '#148a4e',        -- 主题色
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed initial projects
INSERT INTO projects (slug, name, name_en, theme_color) VALUES
  ('greenhouse', '温室自动化改造', 'Greenhouse Automation Retrofit', '#148a4e'),
  ('modu',        'MODU 模组玩具',   'MODU Modular Toys',              '#e65100');

-- ============================================================
-- 2. Suppliers
-- ============================================================
CREATE TABLE suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  name_en       TEXT,
  website       TEXT,
  location      TEXT,
  specialty     TEXT,
  contact       TEXT,
  email         TEXT,
  export        TEXT,
  status        TEXT DEFAULT 'pending',  -- pending | contacting | quoted | shortlisted | selected | rejected
  track         TEXT,                    -- A | B | C  (for MODU)
  notes         TEXT,
  logs          JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suppliers_project ON suppliers(project_id);
CREATE INDEX idx_suppliers_status  ON suppliers(status);

-- ============================================================
-- 3. Project Info (key-value, 34-field architecture)
-- ============================================================
CREATE TABLE project_info (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, key)
);

CREATE INDEX idx_project_info_project ON project_info(project_id);

-- ============================================================
-- 4. Coordinator Profiles
-- ============================================================
CREATE TABLE coordinator_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  title         TEXT,
  title_en      TEXT,
  avatar_url    TEXT,
  phone         TEXT,
  email         TEXT,
  wechat        TEXT,
  whatsapp      TEXT,
  telegram      TEXT,
  description   TEXT,
  description_en TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Phases (project timeline)
-- ============================================================
CREATE TABLE phases (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  name_en       TEXT,
  status        TEXT DEFAULT 'pending',  -- pending | active | done
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_phases_project ON phases(project_id);

-- ============================================================
-- 6. Quiz History
-- ============================================================
CREATE TABLE quiz_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slot          TEXT NOT NULL,
  value         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quiz_project ON quiz_history(project_id);

-- ============================================================
-- 7. Edit History
-- ============================================================
CREATE TABLE edit_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  detail        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_edit_history_project ON edit_history(project_id);

-- ============================================================
-- Enable Row Level Security
-- ============================================================
ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_info         ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordinator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: Public Read
-- Display pages (index.html, modu-index.html) are anonymous
-- ============================================================
CREATE POLICY "Public can view projects"
  ON projects FOR SELECT USING (true);

CREATE POLICY "Public can view suppliers"
  ON suppliers FOR SELECT USING (true);

CREATE POLICY "Public can view project_info"
  ON project_info FOR SELECT USING (true);

CREATE POLICY "Public can view coordinator_profiles"
  ON coordinator_profiles FOR SELECT USING (true);

CREATE POLICY "Public can view phases"
  ON phases FOR SELECT USING (true);

-- ============================================================
-- RLS Policies: Authenticated Write
-- Admin pages require login
-- ============================================================
-- suppliers: full CRUD for authenticated users
CREATE POLICY "Authenticated can insert suppliers"
  ON suppliers FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update suppliers"
  ON suppliers FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete suppliers"
  ON suppliers FOR DELETE USING (auth.role() = 'authenticated');

-- project_info: insert/update for authenticated
CREATE POLICY "Authenticated can upsert project_info"
  ON project_info FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update project_info"
  ON project_info FOR UPDATE USING (auth.role() = 'authenticated');

-- coordinator_profiles: update
CREATE POLICY "Authenticated can update coordinator"
  ON coordinator_profiles FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert coordinator"
  ON coordinator_profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- phases
CREATE POLICY "Authenticated can insert phases"
  ON phases FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update phases"
  ON phases FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete phases"
  ON phases FOR DELETE USING (auth.role() = 'authenticated');

-- quiz_history: anyone can insert (client-facing Quiz)
CREATE POLICY "Anyone can insert quiz_history"
  ON quiz_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can view quiz_history"
  ON quiz_history FOR SELECT USING (true);

-- edit_history
CREATE POLICY "Authenticated can insert edit_history"
  ON edit_history FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Public can view edit_history"
  ON edit_history FOR SELECT USING (true);

-- projects: admin can update
CREATE POLICY "Authenticated can update projects"
  ON projects FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- Helper: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON coordinator_profiles
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- Seed: coordinator (you can update this later)
-- ============================================================
INSERT INTO coordinator_profiles (name, title, title_en, email)
VALUES ('HUA', '采购代理', 'Sourcing Agent', 'your-email@example.com');
