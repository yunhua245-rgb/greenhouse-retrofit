-- ============================================================
-- 8. Supplier Documents (supplier_documents)
-- 运行于 Supabase SQL Editor
-- ============================================================
CREATE TABLE supplier_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  file_size     BIGINT,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_supplier_docs_supplier ON supplier_documents(supplier_id);
CREATE INDEX idx_supplier_docs_project ON supplier_documents(project_id);

ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;

-- Public can view documents
CREATE POLICY "Public can view supplier_documents"
  ON supplier_documents FOR SELECT USING (true);

-- Authenticated can insert/delete documents
CREATE POLICY "Authenticated can insert supplier_documents"
  ON supplier_documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete supplier_documents"
  ON supplier_documents FOR DELETE USING (auth.role() = 'authenticated');
