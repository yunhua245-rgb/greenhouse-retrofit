// One-time: creates supplier_documents table in Supabase
// Call: POST /api/run-migration?secret=migrate-supplier-docs-2026

const { Pool } = require('pg');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if ((req.query.secret || '') !== 'migrate-supplier-docs-2026') return res.status(403).json({ error: 'forbidden' });

  let pool;
  try {
    pool = new Pool({
      host: 'aws-0-ap-northeast-2.pooler.supabase.com',
      port: 6543,
      user: 'postgres.iwbkscwtlluziexacjta',
      password: 'XgvgFORSIUP1d2OG',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      max: 1
    });

    await pool.query('SELECT 1'); // test connection

    const sql = `
      CREATE TABLE IF NOT EXISTS supplier_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        file_size BIGINT,
        mime_type TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_docs_supplier ON supplier_documents(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_docs_project ON supplier_documents(project_id);
      ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Public can view supplier_documents" ON supplier_documents;
      CREATE POLICY "Public can view supplier_documents" ON supplier_documents FOR SELECT USING (true);
      DROP POLICY IF EXISTS "Authenticated can insert supplier_documents" ON supplier_documents;
      CREATE POLICY "Authenticated can insert supplier_documents" ON supplier_documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
      DROP POLICY IF EXISTS "Authenticated can delete supplier_documents" ON supplier_documents;
      CREATE POLICY "Authenticated can delete supplier_documents" ON supplier_documents FOR DELETE USING (auth.role() = 'authenticated');
    `;

    await pool.query(sql);
    res.status(200).json({ ok: true, message: 'Migration complete — supplier_documents table created with RLS' });
  } catch (e) {
    res.status(500).json({ error: e.message, code: e.code });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
};
