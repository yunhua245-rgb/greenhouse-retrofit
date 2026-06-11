// ============================================================
// Supabase Client — shared by all pages
// Config: edit SUPABASE_URL and SUPABASE_ANON_KEY below
// ============================================================

// ⚠️ Replace these with your Supabase project values
var SUPABASE_URL = 'https://iwbkscwtlluziexacjta.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YmtzY3d0bGx1emlleGFjanRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTczNzYsImV4cCI6MjA5NjczMzM3Nn0.s2YsQeLVIRTOy3V8bSsU4HVASY6bQox_rm9_QAN7m3E';

// NOTE: CDN script declares global `var supabase = {...}`, so we must NOT use `const supabase` here.
// Instead, we reassign the global variable to the client instance.
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Auth helpers (username + password login)
// ============================================================

// Check and return current session
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showLoginForm();
    return null;
  }
  return session;
}

// Show login form overlay
function showLoginForm() {
  if (document.getElementById('auth-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.15)">
        <h2 style="font-size:18px;margin-bottom:24px;color:#1a1a2e">管理后台登录</h2>
        <input id="auth-email" type="text" placeholder="admin" value="admin"
          style="width:100%;padding:12px 16px;border:1.5px solid #d0d5dd;border-radius:10px;font-size:14px;margin-bottom:12px;outline:none;box-sizing:border-box">
        <input id="auth-password" type="password" placeholder="密码"
          style="width:100%;padding:12px 16px;border:1.5px solid #d0d5dd;border-radius:10px;font-size:14px;margin-bottom:16px;outline:none;box-sizing:border-box">
        <button id="auth-submit"
          style="width:100%;padding:12px;background:#148a4e;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">
          登录
        </button>
        <p id="auth-msg" style="margin-top:12px;font-size:13px;color:#e24b4a;display:none"></p>
        <p style="font-size:11px;color:#aaa;margin-top:16px">仅限管理员使用 · 账号 admin</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const doLogin = async () => {
    var email = document.getElementById('auth-email').value.trim();
    // Auto-append domain if just "admin" was entered
    if (email && !email.includes('@')) email = email + '@greenhouse.local';
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return;
    const btn = document.getElementById('auth-submit');
    const msg = document.getElementById('auth-msg');
    btn.disabled = true; btn.textContent = '登录中...';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      msg.textContent = '登录失败：' + (error.message||'账号或密码错误');
      msg.style.color = '#e24b4a';
      msg.style.display = 'block';
      btn.disabled = false; btn.textContent = '登录';
    } else {
      document.getElementById('auth-overlay').remove();
      location.reload();
    }
  };

  document.getElementById('auth-submit').onclick = doLogin;
  document.getElementById('auth-password').onkeydown = function(e) { if (e.key === 'Enter') doLogin(); };
  document.getElementById('auth-email').onkeydown = function(e) { if (e.key === 'Enter') document.getElementById('auth-password').focus(); };
}

// Sign out
async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}

// ============================================================
// Data access helpers (queries with project slug)
// ============================================================

// Cache project ID lookup
var _projectIdCache = {};

async function getProjectId(slug) {
  if (_projectIdCache[slug]) return _projectIdCache[slug];
  const { data } = await supabase.from('projects').select('id').eq('slug', slug).single();
  if (data) _projectIdCache[slug] = data.id;
  return data?.id || null;
}

// Get all suppliers for a project
async function getSuppliers(projectSlug) {
  const projectId = await getProjectId(projectSlug);
  if (!projectId) return [];
  const { data, error } = await supabase.from('suppliers').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { console.error('getSuppliers error:', error); return []; }
  return data || [];
}

// Get project info as key-value object
async function getProjectInfo(projectSlug) {
  const projectId = await getProjectId(projectSlug);
  if (!projectId) return {};
  const { data, error } = await supabase.from('project_info').select('key,value').eq('project_id', projectId);
  if (error) { console.error('getProjectInfo error:', error); return {}; }
  const info = {};
  (data || []).forEach(row => { info[row.key] = row.value; });
  return info;
}

// Set project info (upsert)
async function setProjectInfo(projectSlug, key, value) {
  const session = await requireAuth();
  if (!session) throw new Error('Not authenticated');
  const projectId = await getProjectId(projectSlug);
  if (!projectId) throw new Error('Project not found');
  const { error } = await supabase.from('project_info').upsert(
    { project_id: projectId, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'project_id,key' }
  );
  if (error) throw error;
}

// Get coordinator profile
async function getCoordinator() {
  const { data } = await supabase.from('coordinator_profiles').select('*').limit(1).single();
  return data || {};
}

// Update coordinator profile
async function updateCoordinator(profile) {
  const session = await requireAuth();
  if (!session) throw new Error('Not authenticated');
  const current = await getCoordinator();
  const { error } = await supabase.from('coordinator_profiles').upsert(
    { ...current, ...profile, updated_at: new Date().toISOString() }
  );
  if (error) throw error;
}

// Get phases for a project
async function getPhases(projectSlug) {
  const projectId = await getProjectId(projectSlug);
  if (!projectId) return [];
  const { data } = await supabase.from('phases').select('*').eq('project_id', projectId).order('sort_order', { ascending: true });
  return data || [];
}

// Get quiz history
async function getQuizHistory(projectSlug) {
  const projectId = await getProjectId(projectSlug);
  if (!projectId) return [];
  const { data } = await supabase.from('quiz_history').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  return data || [];
}

// Save quiz answer (public)
async function saveQuizAnswer(projectSlug, slot, value) {
  const projectId = await getProjectId(projectSlug);
  if (!projectId) throw new Error('Project not found');
  const { error } = await supabase.from('quiz_history').insert({ project_id: projectId, slot, value });
  if (error) throw error;
  return await setProjectInfo(projectSlug, slot, value);
}

// ============================================================
// Document management (for supplier files)
// ============================================================

// Get documents for a supplier
async function getSupplierDocuments(supplierId) {
  if (!supplierId) return [];
  var _a = await supabase.from('supplier_documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false });
  if (_a.error) { console.error('getSupplierDocuments error:', _a.error); return []; }
  return _a.data || [];
}

// Get documents for all suppliers in a project (keyed by supplier_id)
async function getAllProjectDocuments(projectSlug) {
  var projectId = await getProjectId(projectSlug);
  if (!projectId) return {};
  var _a = await supabase.from('supplier_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (_a.error) return {};
  var map = {};
  (_a.data || []).forEach(function(d) { if (!map[d.supplier_id]) map[d.supplier_id] = []; map[d.supplier_id].push(d); });
  return map;
}

// Upload a document (requires auth)
async function uploadSupplierDoc(supplierId, projectSlug, file) {
  var session = await requireAuth();
  if (!session) throw new Error('Not authenticated');
  var projectId = await getProjectId(projectSlug);
  if (!projectId) throw new Error('Project not found');
  var path = projectSlug + '/' + supplierId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  var _a = await supabase.storage.from('supplier-docs').upload(path, file, { cacheControl: '3600', upsert: false });
  if (_a.error) throw _a.error;
  var _b = await supabase.from('supplier_documents').insert({
    supplier_id: supplierId, project_id: projectId,
    filename: file.name, storage_path: _a.data.path,
    file_size: file.size, mime_type: file.type
  });
  if (_b.error) throw _b.error;
  return _b.data;
}

// Get public URL for a document
function getDocPublicUrl(storagePath) {
  return SUPABASE_URL + '/storage/v1/object/public/' + storagePath;
}

// Delete a document (requires auth)
async function deleteSupplierDoc(docId) {
  var session = await requireAuth();
  if (!session) throw new Error('Not authenticated');
  var _a = await supabase.from('supplier_documents').select('storage_path').eq('id', docId).single();
  if (_a.error) throw _a.error;
  if (_a.data && _a.data.storage_path) {
    await supabase.storage.from('supplier-docs').remove([_a.data.storage_path]);
  }
  var _b = await supabase.from('supplier_documents').delete().eq('id', docId);
  if (_b.error) throw _b.error;
}

// Find supplier UUID by name (for admin pages that use localStorage)
async function findSupplierByName(projectSlug, name) {
  var projectId = await getProjectId(projectSlug);
  if (!projectId) return null;
  var _a = await supabase.from('suppliers').select('id').eq('project_id', projectId).eq('name', name).limit(1);
  if (_a.error || !_a.data || _a.data.length === 0) return null;
  return _a.data[0].id;
}
