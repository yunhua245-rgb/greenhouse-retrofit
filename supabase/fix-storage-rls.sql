-- ============================================================
-- 修复 Storage Bucket RLS 策略
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. 先创建 bucket（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-docs',
  'supplier-docs',
  true,
  52428800,  -- 50MB
  ARRAY['application/pdf','image/png','image/jpeg','image/gif',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain','application/zip']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. 删除旧的 storage.objects 策略（如果存在）
DROP POLICY IF EXISTS "Public can read supplier-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload supplier-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update supplier-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete supplier-docs" ON storage.objects;

-- 3. 创建新的 storage.objects RLS 策略
-- 允许所有人读取（public bucket）
CREATE POLICY "Public can read supplier-docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'supplier-docs');

-- 允许已认证用户上传文件
CREATE POLICY "Authenticated can upload supplier-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'supplier-docs'
    AND auth.role() = 'authenticated'
  );

-- 允许已认证用户更新文件
CREATE POLICY "Authenticated can update supplier-docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'supplier-docs'
    AND auth.role() = 'authenticated'
  );

-- 允许已认证用户删除文件
CREATE POLICY "Authenticated can delete supplier-docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'supplier-docs'
    AND auth.role() = 'authenticated'
  );

-- 4. 同样为 avatars bucket 设置（如果存在）
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload avatars" ON storage.objects;

CREATE POLICY "Public can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );
