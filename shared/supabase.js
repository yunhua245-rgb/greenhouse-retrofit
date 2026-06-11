// ============================================================
// Supabase Client — shared by all pages
// Config: edit SUPABASE_URL and SUPABASE_ANON_KEY below
// ============================================================

// ⚠️ Replace these with your Supabase project values
const SUPABASE_URL = 'https://iwbkscwtlluziexacjta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YmtzY3d0bGx1emlleGFjanRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTczNzYsImV4cCI6MjA5NjczMzM3Nn0.s2YsQeLVIRTOy3V8bSsU4HVASY6bQox_rm9_QAN7m3E';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Auth helpers
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
        <h2 style="font-size:18px;margin-bottom:8px;color:#1a1a2e">管理后台登录</h2>
        <p style="font-size:13px;color:#888;margin-bottom:24px">输入邮箱，我们将发送登录链接</p>
        <input id="auth-email" type="email" placeholder="admin@example.com"
          style="width:100%;padding:12px 16px;border:1.5px solid #d0d5dd;border-radius:10px;font-size:14px;margin-bottom:12px;outline:none;box-sizing:border-box">
        <button id="auth-submit"
          style="width:100%;padding:12px;background:#148a4e;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">
          发送登录链接
        </button>
        <p id="auth-msg" style="margin-top:12px;font-size:13px;color:#148a4e;display:none"></p>
        <p style="font-size:11px;color:#aaa;margin-top:16px">仅限管理员使用</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('auth-submit').onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return;
    const btn = document.getElementById('auth-submit');
    const msg = document.getElementById('auth-msg');
    btn.disabled = true; btn.textContent = '发送中...';
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      msg.textContent = '发送失败：' + error.message;
      msg.style.color = '#e24b4a';
      msg.style.display = 'block';
      btn.disabled = false; btn.textContent = '发送登录链接';
    } else {
      msg.textContent = '已发送登录链接到 ' + email + '，请查收邮件';
      msg.style.color = '#148a4e';
      msg.style.display = 'block';
      btn.textContent = '已发送';
    }
  };
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
const _projectIdCache = {};

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
