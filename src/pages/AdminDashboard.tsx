import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Users, FileText, DollarSign, UserPlus, UserCheck, UserX, LogOut, Edit, Trash2, Save, Download, Share2, RefreshCw, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import fr from '@/i18n/fr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { generateResumeHTML } from '@/lib/resumeTemplate';
import { useRef } from 'react';

interface PendingUser { id: string; user_id: string; display_name: string; email: string; created_at: string; }
interface Analytics { total_resumes: number; completed_resumes: number; unique_users: number; total_cost_cents: number; month: string; }
interface FullUserProfile { user_id: string; display_name: string; email: string; approved: boolean; created_at: string; role: string | null; }
interface EnhancedResume { id: string; user_id: string; original_filename: string; prompt?: string | null; status: string; error_message?: string | null; created_at: string; updated_at: string; ai_cost_cents: number | null; display_name: string | null; niche: string | null; pdf_url?: string | null; docx_url?: string | null; text_url?: string | null; json_url?: string | null; image_url?: string | null; shared?: boolean; owner_display_name?: string | null; job_title?: string | null; enhancer_display_name?: string | null; }

const AdminDashboard = () => {
  const t = fr;
  const { user, signOut } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'client'>('client');
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<FullUserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<FullUserProfile | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<string>('client');
  const [showActiveUsersModal, setShowActiveUsersModal] = useState(false);
  const [activeUsersList, setActiveUsersList] = useState<{ user_id: string; display_name: string | null; email?: string | null; resume_count?: number }[]>([]);
  const [loadingActiveUsers, setLoadingActiveUsers] = useState(false);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(0);
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'client' | 'admin'>>({});
  const [resumes, setResumes] = useState<EnhancedResume[]>([]);
  const [nicheFilter, setNicheFilter] = useState<string>('all');
  const [niches, setNiches] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [userSearch, setUserSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [resumeJsonById, setResumeJsonById] = useState<Record<string, any>>({});
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<EnhancedResume | null>(null);
  const [editingData, setEditingData] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [editingJsonText, setEditingJsonText] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Editor search/navigation state for admin edit dialog (mirrors client editor)
  const [editorSearch, setEditorSearch] = useState<string>('');
  const [editorSearchMatches, setEditorSearchMatches] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [viewingJob, setViewingJob] = useState<EnhancedResume | null>(null);
  const [viewingHtml, setViewingHtml] = useState<string | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const viewingIframeRef = useRef<HTMLIFrameElement | null>(null);
  const editImageInputRef = useRef<HTMLInputElement | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);
  // Whether to include the AI report/rapport when exporting/printing from the admin dialog
  const [includeReportOnDownloadAdmin, setIncludeReportOnDownloadAdmin] = useState<boolean>(true);
  // AI cost state for the analytics card
  const [aiCost, setAiCost] = useState<number | null>(null);
  const [estimatingAiCost, setEstimatingAiCost] = useState<boolean>(false);
  // Date range for OpenAI costs (ISO date strings)
  const defaultEnd = new Date();
  const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [costStartDate, setCostStartDate] = useState<string>(defaultStart.toISOString().slice(0,10));
  const [costEndDate, setCostEndDate] = useState<string>(defaultEnd.toISOString().slice(0,10));

  // active tab for responsive control (mobile select)
  const [activeTab, setActiveTab] = useState<string>('users');
  // Mobile nav open state
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  // Multi-delete selection state (admin)
  const [multiSelectModeAdmin, setMultiSelectModeAdmin] = useState<boolean>(false);
  const [multiSelectedIdsAdmin, setMultiSelectedIdsAdmin] = useState<Record<string, boolean>>({});
  const [multiDeletingAdmin, setMultiDeletingAdmin] = useState<boolean>(false);

  useEffect(() => { loadDashboardData(); }, []);

  // Debounce reload when user search changes
  useEffect(() => {
    const t = setTimeout(() => { loadDashboardData(); }, 350);
    return () => clearTimeout(t);
  }, [userSearch]);

  const loadDashboardData = async () => {
    try {
      const { data: pendingData } = await supabase.from('profiles')
        .select('id, user_id, display_name, email, created_at')
        .eq('approved', false).order('created_at', { ascending: false });
      setPendingUsers(pendingData || []);

      const { data: analyticsData } = await supabase.rpc('get_analytics');
      setAnalytics(analyticsData || []);

      // Load user profiles (apply optional server-side search)
      let usersQuery: any = supabase.from('profiles').select('user_id, display_name, email, approved, created_at');
      if (userSearch && userSearch.trim()) {
        const us = `%${userSearch.trim()}%`;
        usersQuery = usersQuery.or(`display_name.ilike.${us},email.ilike.${us}`);
      }
      const { data: usersData } = await usersQuery;
      if (usersData?.length) {
  const ids = usersData.map(u => u.user_id);
        const { data: rolesData } = await supabase.from('user_roles').select('user_id, role').in('user_id', ids);
        const roleMap: Record<string,string> = {};
        rolesData?.forEach(r => { if (!roleMap[r.user_id] || r.role === 'admin') roleMap[r.user_id] = r.role; });
  setAllUsers(usersData.map(u => ({ ...u, role: roleMap[u.user_id] || null })) as FullUserProfile[]);
      } else setAllUsers([]);

  // Load all resumes (admin can see every resume)
      // Apply optional server-side search filter by owner_display_name or job_title
  let query = supabase.from('resume_jobs').select('id, user_id, original_filename, prompt, status, error_message, ai_cost_cents, created_at, updated_at, shared, pdf_url, docx_url, text_url, json_url, image_url, niche, owner_display_name, job_title, enhancer_display_name');
      if (searchTerm && searchTerm.trim()) {
        const s = `%${searchTerm.trim()}%`;
        // Use ilike to match case-insensitively against owner_display_name or job_title
        query = query.or(`owner_display_name.ilike.${s},job_title.ilike.${s}`);
      }
      const { data: resumeData, error: resumeError } = await query.order('created_at', { ascending: false });
      if (resumeError) {
        console.error('Error loading resumes', resumeError);
  } else if (resumeData && resumeData.length) {
        // Debug: log whether enhancer_display_name is present in fetched rows
        try { console.debug('resumeData enhancer_display_name sample:', resumeData.slice(0,10).map((r:any)=>r.enhancer_display_name)); } catch (e) {}
  const resumeDataAny = resumeData as any[];
  const resumeUserIds = Array.from(new Set(resumeDataAny.map(r => r.user_id)));
        const { data: resumeProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, niche')
          .in('user_id', resumeUserIds);
        const profileMap: Record<string, { display_name: string | null; niche: string | null }> = {};
        resumeProfiles?.forEach(p => { profileMap[p.user_id] = { display_name: p.display_name, niche: p.niche }; });
  const enhanced: EnhancedResume[] = (resumeData as any[]).map(r => ({
          id: r.id,
          user_id: r.user_id,
          original_filename: r.original_filename,
          prompt: (r as any).prompt,
          status: (r as any).status,
          error_message: (r as any).error_message,
          created_at: r.created_at,
          updated_at: r.updated_at,
          ai_cost_cents: r.ai_cost_cents,
          display_name: profileMap[r.user_id]?.display_name || null,
          owner_display_name: (r as any).owner_display_name || profileMap[r.user_id]?.display_name || null,
          job_title: (r as any).job_title || null,
          enhancer_display_name: (r as any).enhancer_display_name || null,
          niche: (r as any).niche || profileMap[r.user_id]?.niche || null,
          shared: (r as any).shared,
          pdf_url: (r as any).pdf_url,
          docx_url: (r as any).docx_url,
          text_url: (r as any).text_url,
          json_url: (r as any).json_url,
          image_url: (r as any).image_url,
        }));
  setResumes(enhanced);
  try { console.debug('enhanced resumes enhancer_display_name sample:', enhanced.slice(0,10).map(e=>e.enhancer_display_name)); } catch (e) {}
        const uniqueNiches = Array.from(new Set(enhanced.map(r => r.niche).filter(Boolean))) as string[];
        uniqueNiches.sort((a,b)=>a.localeCompare(b));
  setNiches(uniqueNiches);
        // Preload JSON for card display
        (async () => {
            try {
              await Promise.allSettled(enhanced.map(async (j) => {
                if (!j.json_url) return;
                try {
                  const data = await fetchJsonFromPublicOrStorage(j.json_url);
                  const normalized = { ...(data || {}) };
                  if (normalized.rapport && !normalized.report) normalized.report = normalized.rapport;
                  if (normalized.report && !normalized.rapport) normalized.rapport = normalized.report;
                  setResumeJsonById(prev => ({ ...prev, [j.id]: normalized }));
                } catch {}
              }));
            } catch {}
          })();
      } else {
        setResumes([]);
        setNiches([]);
      }
  // Refresh realtime active users count
  await loadActiveUsersCount();
    } catch (e) { console.error('Load data error', e); }
    finally { setLoading(false); }
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case 'completed': return 'Terminé';
      case 'processing': return 'En cours';
      case 'failed': return 'Échoué';
      default: return status ? (status.charAt(0).toUpperCase() + status.slice(1)) : '';
    }
  };

  // Safely render values that might be strings, arrays or objects to avoid React child errors
  const renderBriefValue = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      // If array of primitives, join; if array of objects, render a compact comma-separated summary
      if (v.every(i => typeof i === 'string' || typeof i === 'number' || typeof i === 'boolean')) return v.join(', ');
      return v.map((item, idx) => {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item);
        // object -> assemble a few primary fields if present, otherwise JSON stringify
        if (item && typeof item === 'object') {
          const keys = ['diplome','periode','specialite','etablissement','lieu','titre','role','company','start_year','end_year','annee'];
          const parts: string[] = [];
          for (const k of keys) {
            if (item[k]) parts.push(String(item[k]));
          }
          if (parts.length) return parts.join(' — ');
          try { return JSON.stringify(item); } catch { return String(item); }
        }
        return String(item);
      }).join(' ; ');
    }
    // object
    if (typeof v === 'object') {
      const keys = ['diplome','periode','specialite','etablissement','lieu','mention','details','titre','role','company','start_year','end_year','annee'];
      const parts: string[] = [];
      for (const k of keys) {
        if (v[k]) parts.push(String(v[k]));
      }
      if (parts.length) return parts.join(' — ');
      try { return JSON.stringify(v); } catch { return '[objet]'; }
    }
    return String(v);
  };

  // Load the number of active users based on recent activity window
  const loadActiveUsersCount = async (minutes = 15) => {
    try {
  // Use untyped supabase call for presence table (not in typed schema)
  const resp: any = await (supabase as any).from('user_presence').select('user_id').eq('online', true);
  const data = resp?.data as any[] | null;
  const ids = Array.from(new Set((data || []).map((d:any) => d.user_id))).filter(Boolean);
  setActiveUsersCount(ids.length);
    } catch (e:any) { console.error('Failed loading active users count', e); setActiveUsersCount(0); }
  };

    // Debounced reload when search term changes
    useEffect(() => {
      const t = setTimeout(() => { loadDashboardData(); }, 350);
      return () => clearTimeout(t);
    }, [searchTerm]);

  // Helpers for JSON fetching and cache-busting
  function cacheBustedUrl(base: string) {
    try { const u = new URL(base); u.searchParams.delete('ts'); u.searchParams.set('ts', String(Date.now())); return u.toString(); } catch {}
    const cleaned = base.replace(/[?&]ts=[^&]*/g, '');
    return cleaned + (cleaned.includes('?') ? '&' : '?') + 'ts=' + Date.now();
  }
  async function fetchJsonFromPublicOrStorage(base: string) {
    try { const res = await fetch(cacheBustedUrl(base), { cache: 'no-store' }); if (res.ok) return await res.json(); } catch {}
    const m = base.match(/\/object\/public\/resumes\/(.*)$/); if (!m) throw new Error('Invalid storage URL');
    const path = decodeURIComponent(m[1].split('?')[0]);
    const { data, error } = await supabase.storage.from('resumes').download(path);
    if (error) throw error; const txt = await data.text(); return JSON.parse(txt);
  }

  // Helpers to build a structured HTML view for the 'report' field
  function escapeHtml(s: string) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderValueToHtml(v: any): string {
    if (v === null || v === undefined) return '<em>—</em>';
    if (typeof v === 'string') {
      const trimmed = v.trim();
      // HTML-like content — allow simple HTML
      if (/<[^>]+>/.test(trimmed)) return trimmed;
      // Bullet list style: lines starting with '-' or '*'
      const lines = trimmed.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every(l => /^[-*]\s+/.test(l))) {
        return '<ul>' + lines.map(l => `<li>${escapeHtml(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + '</ul>';
      }
      if (lines.length > 1) {
        return lines.map(p => `<p>${escapeHtml(p)}</p>`).join('');
      }
      return `<p>${escapeHtml(trimmed)}</p>`;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return `<span>${escapeHtml(String(v))}</span>`;
    if (Array.isArray(v)) {
      return '<ul>' + v.map(i => `<li>${renderValueToHtml(i)}</li>`).join('') + '</ul>';
    }
    // object
    return renderObjectToHtml(v);
  }

  function renderObjectToHtml(obj: any): string {
    if (!obj || typeof obj !== 'object') return renderValueToHtml(obj);
    return Object.entries(obj).map(([k, v]) => {
      return `<div class="r-field"><div class="r-key">${escapeHtml(k)}</div><div class="r-val">${renderValueToHtml(v)}</div></div>`;
    }).join('');
  }

  function buildStructuredReportHtml(report: any) {
    const body = (report === null || report === undefined)
      ? '<h2>No raport available</h2><p>This resume does not include a raport section.</p>'
      : (typeof report === 'string' ? renderValueToHtml(report) : renderObjectToHtml(report));
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raport</title><style>
      body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial;color:#111;background:#fff;padding:20px}
      .r-field{margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #eee}
      .r-key{font-weight:600;color:#0f172a;margin-bottom:6px}
      .r-val p{margin:0 0 6px}
      .r-val ul{margin:0 0 6px 18px}
      .r-val pre{white-space:pre-wrap;background:#f9fafb;padding:8px;border-radius:6px}
      h2{margin-top:0}
    </style></head><body><div class="report-root">${body}</div></body></html>`;
  }

  // Create an empty template object/primitive that matches the shape of `example`.
  // This lets "Add" create a full set of expected keys instead of an empty object.
  const createTemplateFromExample = (example: any): any => {
    if (example === null || example === undefined) return '';
    if (typeof example === 'string') return '';
    if (typeof example === 'number') return 0;
    if (typeof example === 'boolean') return false;
    if (Array.isArray(example)) {
      // For arrays, prefer empty array (new item will be created by caller using element example)
      return [];
    }
    if (typeof example === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(example)) {
        out[k] = createTemplateFromExample(v);
      }
      return out;
    }
    return '';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Admin actions
  // Helper to call update-user function via fetch to capture raw response body/status
  async function callUpdateUserServer(body: any) {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/update-user`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    return { status: resp.status, data, text };
  }

  const deleteResume = async (job: EnhancedResume) => {
    if (!confirm('Supprimer ce CV et ses fichiers ?')) return;
    setDeletingResumeId(job.id);
    try {
      const basePath = `${job.user_id}/${job.id}`;
      const { data: listData, error: listErr } = await supabase.storage.from('resumes').list(basePath);
      if (listErr) console.warn('List storage objects failed', listErr);
      const dynamicPaths = (listData || []).map(o => `${basePath}/${o.name}`);
      if (dynamicPaths.length) {
        const chunkSize = 100;
        for (let i = 0; i < dynamicPaths.length; i += chunkSize) {
          const chunk = dynamicPaths.slice(i, i + chunkSize);
          const { error: removeErr } = await supabase.storage.from('resumes').remove(chunk);
          if (removeErr) console.warn('Some storage objects may not have been removed', removeErr);
        }
      }

      // Also attempt to remove any files referenced by job URLs that may live outside the job folder
      try {
        const urlFields = ['json_url', 'image_url', 'pdf_url', 'docx_url', 'text_url', 'source_file_url'];
        const extraPaths: string[] = [];
        for (const f of urlFields) {
          const val = (job as any)[f] as string | undefined | null;
          if (!val) continue;
          try {
            const parts = (val || '').split('/resumes/');
            if (parts.length > 1) {
              const maybe = parts[1].split('?')[0];
              if (maybe && !extraPaths.includes(maybe) && !dynamicPaths.includes(maybe)) extraPaths.push(maybe);
            }
          } catch (e) { /* ignore parse errors */ }
        }
        if (extraPaths.length) {
          const chunkSize = 100;
          for (let i = 0; i < extraPaths.length; i += chunkSize) {
            const chunk = extraPaths.slice(i, i + chunkSize);
            const { error: rem2 } = await supabase.storage.from('resumes').remove(chunk);
            if (rem2) console.warn('Failed to remove some referenced storage objects', rem2);
          }
        }
      } catch (e:any) { console.warn('Referenced file removal failed', e); }

      // Try to call server-side function to delete the resume row using service role
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const token = session?.access_token;
        const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const fnUrl = `${baseUrl.replace(/\/$/, '')}/functions/v1/delete-resume`;
        const resp = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: job.id }) });
        const txt = await resp.text(); let data: any = null; try { data = JSON.parse(txt); } catch {}
        if (!resp.ok) throw new Error(data?.error || data?.message || txt || `Function delete-resume failed (${resp.status})`);
        // Success — remove locally
        setResumes(prev => prev.filter(r => r.id !== job.id));
        setResumeJsonById(prev => { const copy = { ...prev }; delete copy[job.id]; return copy; });
        toast({ title: 'Supprimé', description: 'CV et fichiers supprimés.' });
        loadDashboardData();
      } catch (e:any) {
        // Fallback to direct delete attempt (best-effort)
        const { error: delErr } = await supabase.from('resume_jobs').delete().eq('id', job.id);
        if (delErr) {
          toast({ title: 'Échec de la suppression', description: delErr.message || e?.message || String(e), variant: 'destructive' });
        } else {
          setResumes(prev => prev.filter(r => r.id !== job.id));
          setResumeJsonById(prev => { const copy = { ...prev }; delete copy[job.id]; return copy; });
          toast({ title: 'Supprimé', description: 'CV et fichiers supprimés.' });
          loadDashboardData();
        }
      }
    } catch (e:any) {
      console.error('Delete resume error', e);
      toast({ title: 'Échec de la suppression', description: e.message || String(e), variant: 'destructive' });
    } finally { setDeletingResumeId(null); }
  };

  const exportHtml = async (job: EnhancedResume) => {
    try {
      let obj = resumeJsonById[job.id];
      if (!obj && job.json_url) obj = await fetchJsonFromPublicOrStorage(job.json_url);
      const html = generateResumeHTML(obj || {}, job.image_url || undefined);
      // print via hidden iframe to open native Print dialog (Save as PDF)
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error('Could not create iframe document');
      doc.open(); doc.write(html); doc.close();
      await new Promise<void>((res)=>{ const w = iframe.contentWindow as Window; const onLoad = ()=>{ setTimeout(res,250); }; if (w.document.readyState === 'complete') onLoad(); else w.addEventListener('load', onLoad); setTimeout(res,5000); });
      const w = iframe.contentWindow as Window | null; if (!w) throw new Error('Iframe window not available'); try { w.focus(); } catch(e){}
      w.print(); setTimeout(()=>{ try{ iframe.remove(); } catch {} }, 1500);
  } catch (e:any) { toast({ title: 'Échec de l\'exportation', description: e.message || String(e), variant: 'destructive' }); }
  };

  // Open a new window showing the raport HTML (like client modal) — uses same generator
  const openReportWindow = async (job: EnhancedResume) => {
    // legacy: kept for compatibility but prefer popup dialog
    try {
      let obj = resumeJsonById[job.id];
      if (!obj && job.json_url) obj = await fetchJsonFromPublicOrStorage(job.json_url);
      const html = generateResumeHTML(obj || {}, job.image_url || undefined);
      const w = window.open('', '_blank');
  if (!w) { toast({ title: 'Popup bloquée', description: 'Autoriser les popups pour ouvrir le rapport.' }); return; }
      w.document.open(); w.document.write(html); w.document.close();
  } catch (e:any) { toast({ title: 'Échec d\'ouverture', description: e.message || String(e), variant: 'destructive' }); }
  };

  // Open the in-app report dialog (shows generated report HTML)
  const openReportDialog = async (job: EnhancedResume) => {
    try {
      setViewingLoading(true);
      let obj = resumeJsonById[job.id];
      if (!obj && job.json_url) obj = await fetchJsonFromPublicOrStorage(job.json_url);
  const report = obj?.report ?? obj?.rapport ?? null;
  const htmlDoc = buildStructuredReportHtml(report);
  setViewingHtml(htmlDoc);
      setViewingJob(job);
    } catch (e:any) {
      toast({ title: 'Échec d\'ouverture', description: e.message || String(e), variant: 'destructive' });
    } finally { setViewingLoading(false); }
  };

  // Open modal and load active users from recent resume activity (last 30 days)
  const openActiveUsersModal = async () => {
    try {
      setShowActiveUsersModal(true);
      setLoadingActiveUsers(true);
  // Query presence table for currently online users (use untyped supabase to avoid TS schema mismatch)
  const resp2: any = await (supabase as any).from('user_presence').select('user_id').eq('online', true);
  const data2 = resp2?.data as any[] | null;
  const ids = Array.from(new Set((data2 || []).map((d:any) => d.user_id))).filter(Boolean);
  if (!ids.length) { setActiveUsersList([]); return; }
  const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', ids);
  // Also fetch resume counts per user
  const { data: jobs } = await supabase.from('resume_jobs').select('user_id').in('user_id', ids);
  const counts: Record<string, number> = {};
  (jobs || []).forEach((j: any) => { counts[j.user_id] = (counts[j.user_id] || 0) + 1; });
  const list = (profiles || ids.map((id:string)=>({ user_id: id, display_name: null, email: null }))).map((p:any) => ({ user_id: p.user_id, display_name: p.display_name || null, email: p.email || null, resume_count: counts[p.user_id] || 0 }));
  setActiveUsersList(list);
  } catch (e:any) { toast({ title: 'Échec de chargement', description: e.message || String(e), variant: 'destructive' }); setActiveUsersList([]); }
    finally { setLoadingActiveUsers(false); }
  };

  const closeReportDialog = () => { setViewingJob(null); setViewingHtml(null); }

  const exportPdfFromDialog = async () => {
    try {
      const iframe = viewingIframeRef.current;
      if (!iframe) throw new Error('Print frame not ready');
      const w = iframe.contentWindow as Window | null;
      if (!w) throw new Error('Print window not available');
      try { w.focus(); } catch {}
      w.print();
  } catch (e:any) { toast({ title: 'Échec d\'impression', description: e.message || String(e), variant: 'destructive' }); }
  }

  const exportJsonFromDialog = async () => {
    try {
      if (!viewingJob || !viewingJob.json_url) throw new Error('No JSON available');
      const obj = await fetchJsonFromPublicOrStorage(viewingJob.json_url);
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const safeName = ((obj?.personal_information?.full_name) || viewingJob.original_filename || 'resume').replace(/[^a-z0-9-_\.]/gi,'_');
      a.download = `${safeName}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e:any) { toast({ title: 'Échec de l\'exportation', description: e.message || String(e), variant: 'destructive' }); }
  }

  const exportJson = async (job: EnhancedResume) => {
    try {
      if (!job.json_url) throw new Error('No JSON available');
      const obj = await fetchJsonFromPublicOrStorage(job.json_url);
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const safeName = ((obj?.personal_information?.full_name) || job.original_filename || 'resume').replace(/[^a-z0-9-_\.]/gi,'_');
      a.download = `${safeName}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e:any) { toast({ title: 'Échec de l\'exportation', description: e.message || String(e), variant: 'destructive' }); }
  };

  const openEditorForJob = async (job: EnhancedResume) => {
    try {
      let obj = resumeJsonById[job.id];
      if (!obj && job.json_url) obj = await fetchJsonFromPublicOrStorage(job.json_url);
      obj = obj || {};
      const { report, ...rest } = obj; rest.personal_information = rest.personal_information || {};
      rest.skills = Array.isArray(rest.skills) ? rest.skills : []; rest.education = Array.isArray(rest.education) ? rest.education : [];
      rest.certifications = Array.isArray(rest.certifications) ? rest.certifications : []; rest.projects = Array.isArray(rest.projects) ? rest.projects : [];
      setEditingReport(report || null); setEditingData(rest); setEditingJob(job);
      setEditImagePreviewUrl(job.image_url || null); setEditImageFile(null);
      setEditingJsonText(JSON.stringify(obj, null, 2));
    } catch (e:any) { toast({ title: 'Load Failed', description: e.message || String(e), variant: 'destructive' }); }
  };

  const saveEditedJson = async () => {
    if (!editingJob) return; setSavingEdit(true);
    try {
      const combined = { ...(editingData||{}), report: editingReport || undefined };
      // Upload image if changed
      if (editImageFile) {
        const ext = (editImageFile.name.split('.').pop() || 'png').split('?')[0];
        const path = `${editingJob.user_id}/${editingJob.id}/avatar.${ext}`;
        await supabase.storage.from('resumes').upload(path, editImageFile, { upsert: true, contentType: editImageFile.type });
        const { data: pub } = supabase.storage.from('resumes').getPublicUrl(path);
        const image_url = pub.publicUrl ? cacheBustedUrl(pub.publicUrl) : null;
        await supabase.from('resume_jobs').update({ image_url }).eq('id', editingJob.id);
      }
      // Upload JSON
      const jsonPath = `${editingJob.user_id}/${editingJob.id}/json.json`;
      const file = new File([JSON.stringify(combined, null, 2)], `${editingJob.id}.json`, { type: 'application/json' });
      await supabase.storage.from('resumes').upload(jsonPath, file, { upsert: true, contentType: 'application/json', cacheControl: '0' });
      const { data: pubJ } = supabase.storage.from('resumes').getPublicUrl(jsonPath);
      const json_url = pubJ.publicUrl ? cacheBustedUrl(pubJ.publicUrl) : null;
      await supabase.from('resume_jobs').update({ json_url }).eq('id', editingJob.id);
      toast({ title: 'Enregistré', description: 'CV mis à jour.' }); setEditingJob(null); setEditingData(null);
      loadDashboardData();
    } catch (e:any) { toast({ title: 'Échec de l\'enregistrement', description: e.message || String(e), variant: 'destructive' }); }
    finally { setSavingEdit(false); }
  };

  // Helper to replace existing image for editing job
  const handleReplaceImage = async (file: File | null) => {
    if (!file || !editingJob) return;
    try {
      const jobId = editingJob.id;
      if (!jobId) return;
      if (editingJob.image_url) {
        try {
          const parts = (editingJob.image_url as string).split('/resumes/');
          const maybePath = parts.length > 1 ? parts[1] : null;
          if (maybePath) await supabase.storage.from('resumes').remove([maybePath]);
        } catch (e) { console.warn('old image delete failed', e); }
      }
      const imgPath = `${editingJob.user_id}/${jobId}/image/${encodeURIComponent(file.name)}`;
      const { error: upErr } = await supabase.storage.from('resumes').upload(imgPath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('resumes').getPublicUrl(imgPath);
      const newUrl = pub?.publicUrl || null;
      if (newUrl) {
        await supabase.from('resume_jobs').update({ image_url: newUrl }).eq('id', jobId);
        setEditImagePreviewUrl(newUrl);
        setEditingJob({ ...editingJob, image_url: newUrl } as any);
      }
    } catch (err:any) { toast({ title: 'Image Replace Failed', description: err.message || String(err), variant: 'destructive' }); }
  };

  const handleUploadImage = async (file: File | null) => {
    if (!file || !editingJob) return;
    try {
      const jobId = editingJob.id;
      const imgPath = `${editingJob.user_id}/${jobId}/image/${encodeURIComponent(file.name)}`;
      const { error: upErr } = await supabase.storage.from('resumes').upload(imgPath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('resumes').getPublicUrl(imgPath);
      const newUrl = pub?.publicUrl || null;
      if (newUrl) {
        await supabase.from('resume_jobs').update({ image_url: newUrl }).eq('id', jobId);
        setEditImagePreviewUrl(newUrl);
        setEditingJob({ ...editingJob, image_url: newUrl } as any);
      }
    } catch (err:any) { toast({ title: 'Image Upload Failed', description: err.message || String(err), variant: 'destructive' }); }
  };

  const approveUser = async (userId: string, approve: boolean) => {
    try {
      if (approve) {
        const role = pendingRoles[userId] || 'client';
        // Use server-side function to assign role (service role will upsert)
        try {
          const res = await callUpdateUserServer({ user_id: userId, role });
          if (res.status !== 200) {
            console.error('Role assign failed', res.status, res.text);
            toast({ title: 'Role Assignment Failed', description: (res.data && res.data.error) || res.text || `Status ${res.status}`, variant: 'destructive' });
            return;
          }
        } catch (e:any) {
          console.error('Role assign invoke error', e);
          toast({ title: 'Role Assignment Failed', description: e.message || String(e), variant: 'destructive' });
          return;
        }
      } else {
        // Reject -> delete the user account and profile via server function
        try {
          const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: userId } });
          if (error || (data as any)?.error) {
            console.error('delete-user error', { error, data });
            toast({ title: 'Échec de la suppression', description: (data as any)?.error || error?.message || 'Une erreur est survenue', variant: 'destructive' });
          } else {
            toast({ title: 'Utilisateur supprimé', description: 'Compte supprimé.' });
            // Optimistically remove from pending list and reload
            setPendingUsers(prev => prev.filter(p => p.user_id !== userId));
            loadDashboardData();
          }
        } catch (e:any) {
          console.error('Delete invoke error', e);
          toast({ title: 'Échec de la suppression', description: e.message || String(e), variant: 'destructive' });
        }
        return;
      }

      const { error } = await supabase.from('profiles').update({
        approved: approve,
        approved_by: approve ? user?.id : null,
        approved_at: approve ? new Date().toISOString() : null
      }).eq('user_id', userId);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else { toast({ title: approve ? 'User Approved' : 'User Rejected', description: `User ${approve ? 'approved' : 'rejected'}.` }); loadDashboardData(); }
    } catch (e) { console.error('Approve error', e); }
  };

  const createNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      toast({ title: 'Données manquantes', description: 'Email et mot de passe requis.', variant: 'destructive' });
      return;
    }
    if (!['admin','client'].includes(newUserRole)) {
      toast({ title: 'Rôle invalide', description: 'Choisissez admin ou Staff.', variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase.functions.invoke('create-user', { body: { email: newUserEmail.trim(), password: newUserPassword, role: newUserRole, display_name: newUserDisplayName.trim() || undefined } });
    if (error || (data as any)?.error) {
      console.error('create-user error invoke wrapper', { error, data });
      // Fallback manual fetch to inspect raw error body
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const token = session?.access_token;
  const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const resp = await fetch(`${baseUrl}/functions/v1/create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ email: newUserEmail.trim(), password: newUserPassword, role: newUserRole, display_name: newUserDisplayName.trim() || undefined })
        });
        const text = await resp.text();
        console.error('Raw create-user response', resp.status, text);
        toast({ title: 'Create Failed', description: (data as any)?.error || error?.message || text || 'Unknown error', variant: 'destructive' });
      } catch (e) {
        console.error('Fallback fetch error', e);
        toast({ title: 'Create Failed', description: (data as any)?.error || error?.message || 'Unknown error', variant: 'destructive' });
      }
      return;
    }
  toast({ title: 'Utilisateur créé', description: `Nouvel utilisateur ${newUserRole} créé.` });
  setNewUserEmail(''); setNewUserPassword(''); setNewUserDisplayName(''); setNewUserRole('client');
    loadDashboardData();
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    try {
      setSavingUser(true);

  // Build update body for auth changes (password) and name/role
  const body: any = { user_id: selectedUser.user_id };
  if (editPassword) body.password = editPassword;

  // Build a combined body and call server-side function to handle auth/name/role updates
  const combinedBody: any = { user_id: selectedUser.user_id };
  if (editPassword) combinedBody.password = editPassword;
      if (typeof editName === 'string' && editName !== (selectedUser.display_name || '')) combinedBody.display_name = editName;
      if (typeof editRole === 'string' && editRole !== (selectedUser.role || 'client')) combinedBody.role = editRole;

      if (Object.keys(combinedBody).length > 1) {
        try {
          const res = await callUpdateUserServer(combinedBody);
          if (res.status !== 200) {
            console.error('Update failed', res.status, res.text);
            toast({ title: 'Update Failed', description: (res.data && res.data.error) || res.text || `Status ${res.status}`, variant: 'destructive' });
            setSavingUser(false);
            return;
          }
        } catch (e:any) {
          console.error('Update invoke error', e);
          toast({ title: 'Update Failed', description: e.message || String(e), variant: 'destructive' });
          setSavingUser(false);
          return;
        }
      }

  toast({ title: 'Utilisateur mis à jour', description: 'Modifications enregistrées.' });
  setSelectedUser(null); setEditPassword(''); setEditName(''); setEditRole('client'); loadDashboardData();
    } catch (e) { console.error('Update error', e); }
    finally { setSavingUser(false); }
  };

  const handleDeleteUser = async (userId: string) => {
  if (!confirm('Supprimer ce compte utilisateur ? Cela ne peut pas être annulé.')) return;
    try {
      setDeletingUser(true);
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: userId } });
  if (error || (data as any)?.error) toast({ title: 'Échec de la suppression', description: error?.message || (data as any)?.error, variant: 'destructive' });
  else { toast({ title: 'Utilisateur supprimé', description: 'Compte supprimé.' }); if (selectedUser?.user_id === userId) setSelectedUser(null); loadDashboardData(); }
    } catch (e) { console.error('Delete error', e); }
    finally { setDeletingUser(false); }
  };

  // JSON-driven field renderer (similar to client)
  const renderObjectFields = (obj: any, setObj: (v:any)=>void, path = ''): JSX.Element | null => {
    if (!obj || typeof obj !== 'object') return null;
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      const cleaned = String(path || '').replace(/\[[^\]]*\]/g, '');
      const parts = cleaned.split('.').filter(Boolean);
      const parentKey = parts.length ? parts[parts.length-1] : '';
      return (
        <div className="p-3 border rounded bg-muted/5 text-sm">
          <div className="text-xs text-muted-foreground">Aucun champ défini.</div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => {
              const k = window.prompt('Nom du champ (ex: titre, lieu, annee)');
              if (!k) return;
              try {
                const next = JSON.parse(JSON.stringify(obj));
                (next as any)[k] = '';
                setObj(next);
              } catch (e) { /* ignore */ }
            }}>Ajouter champ</Button>
            <Button size="sm" variant="outline" onClick={() => {
              try {
                const tmpl = createTemplateFromExample({});
                const next = JSON.parse(JSON.stringify(obj));
                Object.assign(next, tmpl || {});
                setObj(next);
              } catch (e) { /* ignore */ }
            }}>Remplir depuis modèle</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => {
          const fieldPath = path ? `${path}.${key}` : key;
          const containerId = `field-${fieldPath.replace(/[^a-z0-9_\-]/gi, '-').replace(/\./g, '-').replace(/\[/g, '-').replace(/\]/g, '-')}`;
          const formattedLabel = String(key).replace(/_/g, ' ').toUpperCase();
          const keyLc = (fieldPath + ' ' + String(key) + ' ' + (typeof value === 'string' ? value : '')).toLowerCase();

          if (value === null || ['string','number','boolean'].includes(typeof value)) {
            return (
              <div key={fieldPath} id={containerId} data-key-lc={keyLc} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
                <Label className="text-sm">{formattedLabel}</Label>
                <Input value={String(value ?? '')} onChange={(e)=>{
                  const next = JSON.parse(JSON.stringify(obj));
                  const orig = value as any; let newVal: any = e.target.value;
                  if (typeof orig === 'number') newVal = Number(newVal || 0);
                  if (typeof orig === 'boolean') newVal = newVal === 'true';
                  (next as any)[key] = newVal; setObj(next);
                }} />
              </div>
            );
          }
          if (Array.isArray(value)) {
            return (
              <div key={fieldPath} id={containerId} data-key-lc={keyLc} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
                <Label className="text-sm">{formattedLabel} (array)</Label>
                <div className="space-y-2">
                  {(value as any[]).map((item, idx) => {
                    const itemPath = `${fieldPath}[${idx}]`;
                    const itemId = `field-${itemPath.replace(/[^a-z0-9_\-]/gi, '-').replace(/\./g, '-').replace(/\[/g, '-').replace(/\]/g, '-')}`;
                    const itemLc = (itemPath + ' ' + (typeof item === 'string' ? item : '')).toLowerCase();
                    return (
                      <div key={idx} id={itemId} data-key-lc={itemLc} className="border p-2 rounded">
                        {typeof item === 'object' ? (
                          renderObjectFields(item, (v)=>{
                            const next = JSON.parse(JSON.stringify(obj));
                            (next as any)[key][idx] = v; setObj(next);
                          }, itemPath)
                        ) : (
                          <Input value={String(item || '')} onChange={(e)=>{
                            const next = JSON.parse(JSON.stringify(obj));
                            (next as any)[key][idx] = e.target.value; setObj(next);
                          }} />
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button variant="destructive" onClick={()=>{
                            const next = JSON.parse(JSON.stringify(obj));
                            (next as any)[key].splice(idx,1); setObj(next);
                          }}>Supprimer</Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button onClick={()=>{
                    const next = JSON.parse(JSON.stringify(obj));
                    // If the array contains objects, create a template based on the first element structure
                    if ((value as any[]).length > 0 && typeof (value as any[])[0] === 'object') {
                      (next as any)[key].push(createTemplateFromExample((value as any[])[0]));
                    } else if ((value as any[]).length > 0) {
                      // primitive array -> push empty string
                      (next as any)[key].push('');
                    } else {
                      // empty array, push an empty object to allow keys to be added by the user
                      (next as any)[key].push({});
                    }
                    setObj(next);
                  }}>Ajouter</Button>
                </div>
              </div>
            );
          }
          return (
            <div key={fieldPath} id={containerId} data-key-lc={keyLc} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
              <Label className="text-sm">{formattedLabel}</Label>
              <div className="mt-2 space-y-2">
                {renderObjectFields(value, (v)=>{
                  const next = JSON.parse(JSON.stringify(obj));
                  (next as any)[key] = v; setObj(next);
                }, fieldPath)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Editor search helpers (used by admin edit dialog)
  const runEditorSearch = (qRaw?: string) => {
    const q = ((qRaw ?? editorSearch) || '').trim().toLowerCase();
    setEditorSearchMatches([]);
    setCurrentMatchIndex(0);
    if (!q) return;
    const found: string[] = [];
    try {
      const nodes = Array.from(document.querySelectorAll('[data-key-lc]')) as HTMLElement[];
      for (const n of nodes) {
        const v = (n.getAttribute('data-key-lc') || '').toLowerCase();
        if (v.includes(q)) {
          const id = n.id || (n.closest('[id^="field-"]') as HTMLElement | null)?.id;
          if (id && !found.includes(id)) found.push(id);
        }
      }
      if (!found.length) {
        const labels = Array.from(document.querySelectorAll('label')) as HTMLElement[];
        for (const l of labels) {
          const txt = (l.textContent || '').toLowerCase();
          if (txt.includes(q)) {
            const container = l.closest('[id^="field-"]') as HTMLElement | null;
            if (container && container.id && !found.includes(container.id)) found.push(container.id);
          }
        }
      }
    } catch (e) { /* ignore DOM errors */ }
    setEditorSearchMatches(found);
    if (found.length) setTimeout(()=> goToMatch(0), 80);
    else toast({ title: 'Aucun champ trouvé', description: `Aucun champ correspondant à "${q}"`, variant: 'destructive' });
  };

  const goToMatch = (index: number) => {
    if (!editorSearchMatches || editorSearchMatches.length === 0) return;
    const idx = ((index % editorSearchMatches.length) + editorSearchMatches.length) % editorSearchMatches.length;
    const id = editorSearchMatches[idx];
    const el = id ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { el.animate?.([{ background: 'rgba(247,250,255,0)' }, { background: 'rgba(255,249,240,0.95)' }, { background: 'rgba(247,250,255,0)' }], { duration: 1200 }); } catch {}
      const input = el.querySelector('input, textarea') as HTMLElement | null;
      if (input) try { input.focus(); } catch {}
      setCurrentMatchIndex(idx);
    }
  };

  const navigateMatch = (delta: number) => {
    if (!editorSearchMatches || editorSearchMatches.length === 0) return;
    const next = (currentMatchIndex + delta + editorSearchMatches.length) % editorSearchMatches.length;
    goToMatch(next);
  };

  const totalCostDollars = analytics.reduce((s,i)=>s+(i.total_cost_cents||0),0)/100;

  // Fetch aggregated OpenAI costs from the Supabase Edge Function
  const estimateAiCost = async () => {
    try {
      setEstimatingAiCost(true);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) {
        toast({ title: 'Non authentifié', description: 'Vous devez être connecté pour recalculer les coûts IA.' });
        return;
      }
      const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/get-openai-costs`;
      // Convert selected dates (YYYY-MM-DD) to unix seconds for start (00:00:00) and end (23:59:59)
      const toUnixStart = (isoDate: string) => {
        try { return Math.floor(new Date(isoDate + 'T00:00:00Z').getTime() / 1000); } catch { return null; }
      };
      const toUnixEnd = (isoDate: string) => {
        try { return Math.floor(new Date(isoDate + 'T23:59:59Z').getTime() / 1000); } catch { return null; }
      };
      const startTime = toUnixStart(costStartDate) ?? Math.floor((Date.now() / 1000) - 30*24*60*60);
      const endTime = toUnixEnd(costEndDate) ?? Math.floor(Date.now() / 1000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ start_time: startTime, end_time: endTime }),
      });
      const data = await resp.json().catch(()=>null);
      if (!resp.ok) {
        const msg = data?.raw?.error?.message || data?.error?.message || data?.message || 'Erreur lors du calcul des coûts';
        toast({ title: 'Erreur API', description: msg, variant: 'destructive' });
        return;
      }
      const total = data?.total_cost ?? data?.total ?? data?.total_cost_dollars ?? null;
      if (typeof total === 'number') setAiCost(total);
      else if (data?.raw && typeof data.raw.total_cost === 'number') setAiCost(data.raw.total_cost);
      else {
        // Try to infer from raw response
        const maybe = data?.raw?.data?.reduce?.((acc:any,page:any)=>acc + ((page?.results||[]).reduce((s:any,r:any)=>s + (r?.amount?.value||0),0)),0);
        if (typeof maybe === 'number') setAiCost(maybe);
        else toast({ title: 'Réponse inattendue', description: 'La fonction n\'a pas renvoyé le coût total.' });
      }
    } catch (e:any) {
      console.error('estimateAiCost error', e);
      toast({ title: 'Erreur', description: e?.message || String(e), variant: 'destructive' });
    } finally { setEstimatingAiCost(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 bg-[#163967] text-white flex items-center justify-center font-bold text-xs tracking-tight shadow-sm group-hover:scale-105 transition-transform select-none">MAG</div>
            <span className="font-semibold tracking-tight text-[#163967] hidden sm:inline">{t.dashboard}</span>
            <Badge className="hidden md:inline" variant="secondary">Administrateur</Badge>
          </Link>
          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
            <a href="#analytics" className="text-muted-foreground hover:text-[#163967] transition-colors">Analytique</a>
            <button type="button" onClick={() => setActiveTab('manage')} className="text-muted-foreground hover:text-[#163967] transition-colors">Utilisateurs</button>
            <button type="button" onClick={() => setActiveTab('create')} className="text-muted-foreground hover:text-[#163967] transition-colors">Créer</button>
            {/* Reload moved into section headers for Users and Resumes */}
            <Button variant="outline" size="sm" onClick={signOut} className="flex items-center gap-2"><LogOut className="h-4 w-4"/><span className="hidden sm:inline">{t.sign_out}</span></Button>
          </div>

          {/* Mobile hamburger */}
          <div className="sm:hidden flex items-center">
            <button className="p-2 rounded-md border bg-background/60" onClick={()=>setMobileNavOpen(v=>!v)} aria-label="Open menu" aria-expanded={mobileNavOpen}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
        {/* Mobile full-width stacked menu (outside centered container so it spans the viewport) */}
        {mobileNavOpen && (
          <div className="sm:hidden border-t bg-background/95 supports-[backdrop-filter]:backdrop-blur z-30">
            <div className="container mx-auto px-4 py-3">
              <div className="flex flex-col space-y-2">
                <a href="#analytics" className="block w-full text-left py-2 px-3 rounded hover:bg-muted text-muted-foreground">Analytique</a>
                <button type="button" onClick={() => { setActiveTab('manage'); setMobileNavOpen(false); }} className="block w-full text-left py-2 px-3 rounded hover:bg-muted text-muted-foreground">Utilisateurs</button>
                <button type="button" onClick={() => { setActiveTab('create'); setMobileNavOpen(false); }} className="block w-full text-left py-2 px-3 rounded hover:bg-muted text-muted-foreground">Créer</button>
                <Button variant="outline" size="sm" onClick={signOut} className="w-full flex items-center gap-2 justify-start"><LogOut className="h-4 w-4"/>{t.sign_out}</Button>
              </div>
            </div>
          </div>
        )}
      </nav>
      <main className="container mx-auto px-4 py-8">
        <div id="analytics" className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 scroll-mt-24">
            {[
            { icon: <FileText className="h-5 w-5 mr-2 text-primary" />, label: 'Total CV', value: analytics.reduce((s,i)=>s+(i.total_resumes||0),0) },
            { icon: <UserCheck className="h-5 w-5 mr-2 text-primary" />, label: 'Terminés', value: analytics.reduce((s,i)=>s+(i.completed_resumes||0),0) },
            { icon: <Users className="h-5 w-5 mr-2 text-primary" />, label: 'Utilisateurs actifs', value: activeUsersCount },
              { icon: <DollarSign className="h-5 w-5 mr-2 text-primary" />, label: 'Coûts IA', value: `$${totalCostDollars.toFixed(2)}` }
              ].map(card => (
                <Card key={card.label} onClick={card.label === 'Utilisateurs actifs' ? (()=>openActiveUsersModal()) : undefined} className={card.label === 'Utilisateurs actifs' ? 'cursor-pointer' : ''}>
                  <CardHeader><CardTitle className="flex items-center">{card.icon}{card.label}</CardTitle></CardHeader>
                  <CardContent>
                    {card.label === 'Coûts IA' ? (
                      <div className="flex flex-col sm:flex-row  sm:justify-between">
                        <div>
                          <div className="text-2xl font-bold">{estimatingAiCost ? '...' : (aiCost !== null ? `$${aiCost.toFixed(2)}` : `$${totalCostDollars.toFixed(2)}`)}</div>
                        </div>
                        <div className="mt-3 sm:mt-0 flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">Début</label>
                            <input type="date" value={costStartDate} onChange={(e)=>setCostStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">Fin</label>
                            <input type="date" value={costEndDate} onChange={(e)=>setCostEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                          </div>
                          <div className="w-full sm:w-auto flex justify-end">
                            <Button size="sm" variant="outline" onClick={estimateAiCost} disabled={estimatingAiCost} className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" /> Recalculer
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold">{card.value}</div>
                        {card.label === 'Utilisateurs actifs' && (
                          <div className="text-xs text-muted-foreground mt-2">Cliquez pour voir les utilisateurs actifs</div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Active Users modal */}
        <Dialog open={showActiveUsersModal} onOpenChange={setShowActiveUsersModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Utilisateurs actifs récents</DialogTitle>
              <DialogDescription>Utilisateurs actuellement actifs (présence) dans votre application.</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {loadingActiveUsers ? (
                <div className="flex items-center justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
              ) : (
                <div className="max-h-64 overflow-auto">
                  {activeUsersList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun utilisateur actif trouvé au cours des 30 derniers jours.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activeUsersList.map(u => (
                        <li key={u.user_id} className="border rounded px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold">{u.display_name || u.user_id}</div>
                              <div className="text-xs text-muted-foreground">{u.email || '—'}</div>
                            </div>
                            <div className="text-sm font-medium text-muted-foreground">{u.resume_count ?? 0} CV</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setShowActiveUsersModal(false)}>{t.close}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(String(v))} className="space-y-6">
          {/* Desktop tabs: visible on sm+ */}
          <TabsList className="hidden sm:flex sm:justify-start">
            <TabsTrigger value="users">Gestion des utilisateurs</TabsTrigger>
            <TabsTrigger value="create">{t.create_user}</TabsTrigger>
            <TabsTrigger value="manage">{t.all_user_profiles}</TabsTrigger>
            <TabsTrigger value="resumes">{t.enhanced_resumes}</TabsTrigger>
          </TabsList>

          {/* Mobile select: visible on xs screens - use portal-backed Select to avoid offscreen dropdown */}
          <div className="sm:hidden mb-3">
            <label className="sr-only">Onglets</label>
            <Select value={activeTab} onValueChange={(v) => setActiveTab(String(v))}>
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder={t.create_user} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="users">Gestion des utilisateurs</SelectItem>
                <SelectItem value="create">{t.create_user}</SelectItem>
                <SelectItem value="manage">{t.all_user_profiles}</SelectItem>
                <SelectItem value="resumes">{t.enhanced_resumes}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TabsContent value="users">
            <Card>
                <CardHeader>
                  <div className="flex items-center justify-between w-full">
                    <CardTitle>{t.pending_approvals}</CardTitle>
                    <div>
                      <Button size="sm" variant="outline" onClick={() => { loadDashboardData(); }} className="flex items-center gap-2"><RefreshCw className="h-4 w-4"/>{t.reload}</Button>
                    </div>
                  </div>
                  <CardDescription>{t.assign_role_and_approve}</CardDescription>
                </CardHeader>
              <CardContent>
                {pendingUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t.pending_approvals}</h3>
                    <p className="text-muted-foreground">Tous les utilisateurs ont été approuvés.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingUsers.map(pu => (
                      <div key={pu.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="min-w-0">
                            <h4 className="font-semibold">{pu.display_name}</h4>
                            <p className="text-sm text-muted-foreground truncate">{pu.email}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t.created_label} {new Date(pu.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-4 md:gap-6 md:items-end md:justify-end w-full md:w-auto">
                            <div className="w-full md:w-32">
                              <Label className="text-xs">{t.role}</Label>
                              <Select value={pendingRoles[pu.user_id] || 'client'} onValueChange={(v: 'client' | 'admin') => setPendingRoles(r => ({ ...r, [pu.user_id]: v }))}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="client">staff</SelectItem>
                                  <SelectItem value="admin">Administrateur</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-row md:flex-row gap-2 justify-end w-full md:w-auto">
                              <Button size="sm" onClick={() => approveUser(pu.user_id, true)} className="flex-1 md:flex-none"><UserCheck className="h-4 w-4 mr-2"/>{t.approve}</Button>
                              <Button size="sm" variant="destructive" onClick={() => approveUser(pu.user_id, false)} className="flex-1 md:flex-none"><UserX className="h-4 w-4 mr-2"/>{t.reject}</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{t.create_user}</CardTitle>
                <CardDescription>{"Créer et attribuer des rôles aux nouveaux utilisateurs"}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createNewUser} className="space-y-4">
                  <div><Label htmlFor="display_name">Nom complet</Label><Input id="display_name" value={newUserDisplayName} onChange={(e)=>setNewUserDisplayName(e.target.value)} placeholder="Nom complet" /></div>
                  <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={newUserEmail} onChange={(e)=>setNewUserEmail(e.target.value)} required /></div>
                  <div><Label htmlFor="password">Mot de passe</Label><Input id="password" type="password" value={newUserPassword} onChange={(e)=>setNewUserPassword(e.target.value)} required /></div>
                  <div><Label htmlFor="role">{t.role}</Label><Select value={newUserRole} onValueChange={(v: 'admin' | 'client') => setNewUserRole(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">staff</SelectItem><SelectItem value="admin">Administrateur</SelectItem></SelectContent></Select></div>
                  <Button type="submit"><UserPlus className="h-4 w-4 mr-2"/>{t.create_user}</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="manage">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>{t.all_user_profiles}</CardTitle>
                  <div>
                    <Button size="sm" variant="outline" onClick={() => { loadDashboardData(); }} className="flex items-center gap-2"><RefreshCw className="h-4 w-4"/>{t.reload}</Button>
                  </div>
                </div>
                <CardDescription>{"Voir, modifier ou supprimer des comptes utilisateurs."}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="w-full md:w-64">
                      <Label className="text-xs mb-1 block">Rôle</Label>
                      <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les rôles</SelectItem>
                          <SelectItem value="admin">Administrateur</SelectItem>
                          <SelectItem value="client">staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                      <div className="text-xs text-muted-foreground md:self-center">
                      {allUsers.length} utilisateur{allUsers.length!==1 && 's'}
                    </div>
                    <div className="w-full md:w-64">
                      <Label className="text-xs mb-1 block">Rechercher</Label>
                      <Input placeholder="Rechercher un utilisateur par nom ou e-mail..." value={userSearch} onChange={(e)=>setUserSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
                {allUsers.length === 0 ? <p className="text-sm text-muted-foreground">Aucun utilisateur trouvé.</p> : (
                  <div className="flex flex-col gap-4">
                    {allUsers.filter(u => roleFilter === 'all' || (u.role || 'client') === roleFilter).map(u => (
                      <div key={u.user_id} className="border rounded-md p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0">
                              <h4 className="font-semibold truncate">{u.display_name} {u.role && <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">{u.role === 'admin'? "Administrateur" : "staff"}</span>}</h4>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center md:gap-4 md:justify-end w-full md:w-auto">
                            <div className="text-xs text-muted-foreground mr-0 md:mr-4">
                              <div>Créé : {new Date(u.created_at).toLocaleDateString()}</div>
                              {!u.approved && <div className="text-xs text-amber-600 font-medium">Approbation en attente</div>}
                              {!u.approved && <div className="text-xs text-amber-600 font-medium">{t.pending_approval}</div>}
                            </div>
                            <div className="flex items-center space-x-2 mt-2 md:mt-0">
                              <Button variant="outline" size="sm" onClick={() => { setSelectedUser(u); setEditPassword(''); setEditName(u.display_name || ''); setEditRole(u.role || 'client'); }}><Edit className="h-4 w-4"/></Button>
                              <Button variant="destructive" size="sm" disabled={deletingUser} onClick={() => handleDeleteUser(u.user_id)}><Trash2 className="h-4 w-4"/></Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="resumes">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>{t.enhanced_resumes}</CardTitle>
                  <div>
                    <Button size="sm" variant="outline" onClick={() => { loadDashboardData(); }} className="flex items-center gap-2"><RefreshCw className="h-4 w-4"/>{t.reload}</Button>
                  </div>
                </div>
                <CardDescription>L'administrateur peut voir et gérer tous les CV des utilisateurs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="w-full md:w-64">
                    <Label className="text-xs mb-1 block">Filtrer par niche</Label>
                    <Select value={nicheFilter} onValueChange={setNicheFilter}>
                      <SelectTrigger><SelectValue placeholder="Toutes les niches" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les niches</SelectItem>
                        {niches.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        {niches.length === 0 && <SelectItem value="__none" disabled>Aucune niche</SelectItem>}
                      </SelectContent>
                    </Select>
                    <div className="mt-2">
                      {resumes.filter(r => nicheFilter==='all' || r.niche === nicheFilter).length > 0 && (
                        <Button size="sm" variant={multiSelectModeAdmin ? 'destructive' : 'ghost'} onClick={() => { setMultiSelectModeAdmin(v => { if (v) setMultiSelectedIdsAdmin({}); return !v; }); }}>
                          {multiSelectModeAdmin ? 'Annuler' : 'Sélectionner'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground md:self-center">
                    {resumes.length} CV
                  </div>
                  <div className="w-full md:w-64">
                    <label className="text-xs mb-1 block">Rechercher</label>
                    <div className="flex items-center gap-2">
                      <Input placeholder="Rechercher par propriétaire ou intitulé de poste..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
                      {resumes.filter(r => nicheFilter==='all' || r.niche === nicheFilter).length > 0 && (
                        <Button size="sm" variant={multiSelectModeAdmin ? 'destructive' : 'ghost'} onClick={() => { setMultiSelectModeAdmin(v => { if (v) setMultiSelectedIdsAdmin({}); return !v; }); }}>
                          {multiSelectModeAdmin ? 'Annuler' : 'Sélectionner'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {resumes.filter(r => nicheFilter==='all' || r.niche === nicheFilter).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun CV ne correspond au filtre sélectionné.</p>
                ) : (
                  <div className="space-y-4">
                    {/* Delete selected bar (admin) */}
                    {multiSelectModeAdmin && Object.keys(multiSelectedIdsAdmin).filter(id => multiSelectedIdsAdmin[id]).length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded">
                        <div className="text-sm">{Object.keys(multiSelectedIdsAdmin).filter(id => multiSelectedIdsAdmin[id]).length} sélectionné(s)</div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={async () => {
                            if (!confirm('Supprimer les CV sélectionnés ?')) return;
                            setMultiDeletingAdmin(true);
                            const ids = Object.keys(multiSelectedIdsAdmin).filter(id => multiSelectedIdsAdmin[id]);
                            try {
                              try {
                                const session = (await supabase.auth.getSession()).data.session;
                                const token = session?.access_token;
                                const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
                                const fnUrl = `${baseUrl.replace(/\/$/, '')}/functions/v1/delete-resume`;
                                for (const id of ids) {
                                  const resp = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id }) });
                                  if (!resp.ok) {
                                    const txt = await resp.text(); let d:any = null; try { d = JSON.parse(txt); } catch {};
                                    throw new Error(d?.error || d?.message || txt || `delete-resume failed for ${id}`);
                                  }
                                }
                                // Optimistically remove from local state
                                setResumes(prev => prev.filter(r => !ids.includes(r.id)));
                                setResumeJsonById(prev => { const copy = { ...prev }; ids.forEach(i => delete copy[i]); return copy; });
                                toast({ title: 'Supprimé', description: 'Les CV sélectionnés ont été supprimés.' });
                                setMultiSelectedIdsAdmin({}); setMultiSelectModeAdmin(false);
                                loadDashboardData();
                              } catch (e:any) {
                                // Best-effort fallback: try direct deletes
                                for (const id of ids) {
                                  try { await supabase.from('resume_jobs').delete().eq('id', id); } catch (e) { /* ignore */ }
                                }
                                setResumes(prev => prev.filter(r => !ids.includes(r.id)));
                                setResumeJsonById(prev => { const copy = { ...prev }; ids.forEach(i => delete copy[i]); return copy; });
                                toast({ title: 'Partiellement supprimé', description: e?.message || String(e) });
                                setMultiSelectedIdsAdmin({}); setMultiSelectModeAdmin(false);
                                loadDashboardData();
                              }
                            } catch (e:any) {
                              toast({ title: 'Erreur', description: e?.message || String(e), variant: 'destructive' });
                            } finally { setMultiDeletingAdmin(false); }
                          }}>{multiDeletingAdmin ? 'Suppression...' : 'Supprimer sélection'}</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setMultiSelectedIdsAdmin({}); setMultiSelectModeAdmin(false); }}>Annuler</Button>
                        </div>
                      </div>
                    )}

                    {resumes.filter(r => nicheFilter==='all' || r.niche === nicheFilter).map((job) => {
                      const json = resumeJsonById[job.id];
                      const candidateName = job.owner_display_name || json?.personal_information?.full_name || job.original_filename;
                      const avatar = job.image_url || '/placeholder.svg';
                      // prefer report.summary, fall back to report string, then french rapport, then profil.resume or summary
                      const reportSnippet: string | null = json?.report?.summary || (typeof json?.report === 'string' ? json?.report : null) || json?.rapport?.summary || (typeof json?.rapport === 'string' ? json?.rapport : null) || json?.profil?.resume || json?.summary || null;
                      const formatType = job.pdf_url ? 'PDF' : job.docx_url ? 'DOCX' : job.text_url ? 'Text' : job.status;
                      const formation = json?.formation || json?.personal_information?.formation || (job as any).formation || null;
                      const enhancerName = (job as any).enhancer_display_name || 'Inconnu';
                      return (
                          <div key={job.id} onClick={()=>openReportDialog(job)} role="button" tabIndex={0} className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
                            <div className="flex items-start gap-3 min-w-0">
                              <img src={avatar} alt="Avatar" className="h-12 w-12 md:h-9 md:w-9 rounded object-cover border flex-shrink-0" onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                              <div className="min-w-0">
                                <h4 className="font-semibold truncate max-w-[260px]" title={candidateName}>{candidateName}</h4>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span>{renderBriefValue((job as any).niche || formation || formatType)}</span>
                                  <span>•</span>
                                  <span>{new Date(job.created_at).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 md:items-start md:flex-col md:justify-start">
                              <div className="flex items-center gap-2">
                                <Badge className={getStatusColor(job.status)}>
                                  {translateStatus(job.status)}
                                </Badge>
                                {job.status === 'completed' && job.shared && (
                                  <Badge variant="secondary" className="flex items-center"><Share2 className="h-3 w-3 mr-1"/>{'Partagé'}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          {(job.job_title || json?.personal_information?.job_title || job.prompt) ? (
                            <p className="text-sm text-muted-foreground mb-2 truncate"><strong>Intitulé du poste :</strong> {job.job_title || json?.personal_information?.job_title || job.prompt}</p>
                          ) : null}
                          {formation ? (
                            <p className="text-sm text-muted-foreground mb-2 truncate">
                              <strong>Formation&nbsp;:</strong> {renderBriefValue(formation)}
                            </p>
                          ) : null}
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>Amélioré par&nbsp;:</strong> {renderBriefValue(enhancerName)}
                          </p>
                          {job.error_message && (
                            <p className="text-sm text-red-600 mb-2"><strong>Erreur :</strong> {job.error_message}</p>
                          )}
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="text-xs text-muted-foreground">
                              {reportSnippet ? (
                                <span title={reportSnippet} className="line-clamp-2 max-w-[520px]">{reportSnippet}</span>
                              ) : (
                                <span>Created: {new Date(job.created_at).toLocaleDateString()}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                              {multiSelectModeAdmin && (
                                <input
                                  type="checkbox"
                                  checked={!!multiSelectedIdsAdmin[job.id]}
                                  onChange={(e)=>{ e.stopPropagation(); setMultiSelectedIdsAdmin(prev=>({ ...prev, [job.id]: (e.target as HTMLInputElement).checked })); }}
                                  onClick={(e)=>{ e.stopPropagation(); }}
                                  onMouseDown={(e)=>{ e.stopPropagation(); }}
                                  className="form-checkbox h-4 w-4"
                                />
                              )}
                              <div className="text-xs text-muted-foreground mr-2 hidden sm:block">Cliquer pour ouvrir le rapport</div>
                              <Button size="sm" variant="destructive" disabled={deletingResumeId===job.id} onClick={(e)=>{ e.stopPropagation(); deleteResume(job); }} className="w-full md:w-auto">
                                <Trash2 className="h-4 w-4 mr-1"/>{deletingResumeId===job.id? 'Suppression...' : 'Supprimer'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-background w-full max-w-md border rounded-lg shadow-lg p-6 space-y-6">
                <div className="flex items-start justify-between">
                <div><h3 className="text-lg font-semibold">Modifier l\'utilisateur</h3><p className="text-xs text-muted-foreground">{selectedUser.display_name}</p></div>
                <button onClick={()=>{ setSelectedUser(null); setEditName(''); setEditPassword(''); setEditRole('client'); }} className="text-sm text-muted-foreground hover:text-foreground">Fermer</button>
              </div>
              <form onSubmit={(e)=>{e.preventDefault(); handleSaveUser();}} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="edit-name">Nom</Label><Input id="edit-name" value={editName} onChange={(e)=>setEditName(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="edit-password">Nouveau mot de passe (optionnel)</Label><Input id="edit-password" type="password" value={editPassword} onChange={(e)=>setEditPassword(e.target.value)} placeholder="Laisser vide" /></div>
                  <div className="space-y-2">
                  <Label htmlFor="edit-role">Rôle</Label>
                  <Select value={editRole} onValueChange={(v)=>setEditRole(v)}>
                    <SelectTrigger id="edit-role" className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">staff</SelectItem>
                      <SelectItem value="admin">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={()=>{ setSelectedUser(null); setEditName(''); setEditPassword(''); setEditRole('client'); }}>Annuler</Button>
                  <Button type="submit" disabled={savingUser} className="flex items-center gap-2"><Save className="h-4 w-4"/>{savingUser ? 'Enregistrement...' : 'Enregistrer'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editingJob && (
          <Dialog open={true} onOpenChange={(open)=>{ if(!open) setEditingJob(null); }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit Resume</DialogTitle>
                <DialogDescription>Edit structured resume fields extracted by the AI.</DialogDescription>
              </DialogHeader>
              {editingData && (
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Image section first */}
                  <div className="border-l-4 border-primary/40 pl-3 py-2">
                    <Label>Image</Label>
                    <div className="flex items-center gap-4 mt-2">
                      {editImagePreviewUrl ? (
                        <div className="flex items-center gap-3">
                          <img src={editImagePreviewUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
                          <div className="flex flex-col">
                                    <div className="text-sm">Image actuelle</div>
                            <div className="flex gap-2 mt-2">
                              <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e)=>{ const f = e.target.files?.[0] || null; await handleReplaceImage(f); }} />
                              <Button onClick={()=>editImageInputRef.current?.click()}>Remplacer l'image</Button>
                              <Button variant="ghost" onClick={async ()=>{
                                if (!editingJob?.id) return;
                                try {
                                  if (editingJob.image_url) {
                                    const parts = (editingJob.image_url as string).split('/resumes/'); const maybePath = parts.length>1? parts[1] : null; if (maybePath) await supabase.storage.from('resumes').remove([maybePath]);
                                  }
                                  await supabase.from('resume_jobs').update({ image_url: null }).eq('id', editingJob.id);
                                  setEditImagePreviewUrl(null);
                                  setEditingJob({...editingJob, image_url: null} as any);
                                } catch(e:any){ toast({ title: 'Remove Failed', description: e.message || String(e), variant: 'destructive' }); }
                              }}>Supprimer</Button>
                            </div>
                          </div>
                        </div>
                        ) : (
                        <div>
                          <div className="mt-2">
                            <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e)=>{ const f = e.target.files?.[0] || null; await handleUploadImage(f); }} />
                            <div className="text-sm text-muted-foreground mb-2">{t.no_image_uploaded}</div>
                            <Button onClick={()=>editImageInputRef.current?.click()}>{t.upload_image}</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dynamic JSON-driven editor */}
                  <div className="space-y-3">
                    {/* Compact sticky search/navigation bar (same as client) */}
                    <div className="flex items-center gap-2 sticky top-2 bg-white p-2 rounded z-20 border border-slate-200 shadow-sm">
                      <Input placeholder="Rechercher un champ" value={editorSearch} onChange={(e)=>setEditorSearch(e.target.value)} onKeyDown={(e)=>{ if (e.key === 'Enter') { e.preventDefault(); runEditorSearch(); } }} className="max-w-xs" />
                      <div className="flex items-center gap-1">
                        <Button aria-label="Rechercher" size="sm" className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${!editorSearch.trim() ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=>runEditorSearch()} disabled={!editorSearch.trim()}>
                          <Search className="w-4 h-4" />
                        </Button>
                        <Button aria-label="Précédent" size="sm" className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=>navigateMatch(-1)} disabled={editorSearchMatches.length === 0}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="text-sm text-black px-2">{editorSearchMatches.length ? `${currentMatchIndex+1}/${editorSearchMatches.length}` : '0/0'}</div>
                        <Button aria-label="Suivant" size="sm" className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=>navigateMatch(1)} disabled={editorSearchMatches.length === 0}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                      <Button aria-label="Effacer" size="sm" className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${!editorSearch && editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=>{ setEditorSearch(''); setEditorSearchMatches([]); setCurrentMatchIndex(0); }} disabled={!editorSearch && editorSearchMatches.length === 0}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {renderObjectFields(editingData, setEditingData)}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={()=>{ setEditingJob(null); setEditingData(null); }}>Annuler</Button>
                <Button disabled={savingEdit} onClick={saveEditedJson}>{savingEdit ? 'Enregistrement...' : 'Enregistrer'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Viewing Dialog for report (opened when a card is clicked) */}
        {viewingJob && (
          <Dialog open={true} onOpenChange={(open)=>{ if(!open) closeReportDialog(); }}>
            <DialogContent className="max-w-xl" onClick={(e)=>e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Rapport</DialogTitle>
              </DialogHeader>
              {viewingJob && (
                <div className="space-y-4">
                  <DialogDescription>Résumé et recommandations générés par l'IA pour ce CV.</DialogDescription>
                  <div className="flex items-center gap-3">
                    <img src={viewingJob.image_url || '/placeholder.svg'} onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} className="h-12 w-12 rounded object-cover border" />
                    <div>
                      <div className="font-semibold">{viewingJob.owner_display_name || (resumeJsonById[viewingJob.id]?.personal_information?.full_name) || viewingJob.original_filename}</div>
                      <div className="text-xs text-muted-foreground">{new Date(viewingJob.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="text-sm space-y-2">
                    {(() => {
                      // Prefer French-keyed rapport, but accept English report as fallback
                      const data = resumeJsonById[viewingJob.id] || {};
                      const raw = data?.rapport ?? data?.report ?? null;
                      if (!raw) return <p className="text-muted-foreground">Aucun rapport disponible.</p>;
                      if (typeof raw === 'string') return <p className="whitespace-pre-wrap">{raw}</p>;
                      // Normalize French keys to expected fields
                      const summary = raw.resume ?? raw.summary ?? raw.resume_summary ?? null;
                      const strengths = raw.forces ?? raw.strengths ?? raw.strengths_list ?? [];
                      const gaps = raw.lacunes ?? raw.gaps ?? raw.missing ?? [];
                      const roles = raw.roles_recommandes ?? raw.roles_recommandes ?? raw.recommended_roles ?? raw.recommended_roles ?? [];
                      return (
                        <div className="space-y-2">
                          {summary && <p className="whitespace-pre-wrap">{summary}</p>}
                          {Array.isArray(strengths) && strengths.length > 0 && (
                            <div>
                              <div className="font-medium">Forces</div>
                              <ul className="list-disc pl-6">{strengths.map((s:any, i:number)=>(<li key={i}>{typeof s === 'string' ? s : (s?.titre || s?.title || JSON.stringify(s))}</li>))}</ul>
                            </div>
                          )}
                          {Array.isArray(gaps) && gaps.length > 0 && (
                            <div>
                              <div className="font-medium">Lacunes</div>
                              <ul className="list-disc pl-6">{gaps.map((s:any, i:number)=>(<li key={i}>{typeof s === 'string' ? s : (s?.titre || s?.title || JSON.stringify(s))}</li>))}</ul>
                            </div>
                          )}
                          {Array.isArray(roles) && roles.length > 0 && (
                            <div>
                              <div className="font-medium">Rôles recommandés</div>
                              <ul className="list-disc pl-6">
                                {roles.slice(0,5).map((r:any, idx:number)=> (
                                  <li key={idx}>
                                    <span className="font-medium">{r.titre || r.title || r.nom || '—'}</span>
                                    {r.seniorite || r.seniority ? ` (${r.seniorite || r.seniority})` : ''}
                                    {typeof r.score_de_compatibilite === 'number' ? ` — ${r.score_de_compatibilite}%` : (typeof r.match_score === 'number' ? ` — ${r.match_score}%` : '')}
                                    {r.pourquoi || r.why ? `: ${r.pourquoi || r.why}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <input id="include-report-raport-admin" type="checkbox" checked={includeReportOnDownloadAdmin} onChange={(e)=>setIncludeReportOnDownloadAdmin(e.target.checked)} className="h-4 w-4" />
                    <label htmlFor="include-report-raport-admin" className="text-xs text-muted-foreground">Inclure le rapport dans le PDF</label>
                  </div>
                  <div className="flex justify-start">
                    <div className="flex gap-2">
                      <Button onClick={()=>{
                        if (!viewingJob) return;
                        const data = resumeJsonById[viewingJob.id] || {};
                        const copy = JSON.parse(JSON.stringify(data));
                        // Remove report/rapport keys when admin preference is to exclude
                        if (!includeReportOnDownloadAdmin) {
                          if (copy && copy.report) delete copy.report;
                          if (copy && copy.rapport) delete copy.rapport;
                        }
                        const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const safeName = (data?.personal_information?.full_name || viewingJob.original_filename || 'rapport-ameliore').replace(/\s+/g,'-');
                        a.href = url; a.download = `${safeName}.json`;
                        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                      }}>Exporter</Button>

                      <Button onClick={async ()=>{
                        if (!viewingJob) return;
                        try {
                          // Respect admin preference when printing: clone and remove report/rapport if excluded
                          const rawData = resumeJsonById[viewingJob.id] || {};
                          const data = includeReportOnDownloadAdmin ? rawData : (() => { const c = JSON.parse(JSON.stringify(rawData)); if (c && c.report) delete c.report; if (c && c.rapport) delete c.rapport; return c; })();
                          const html = generateResumeHTML(data, (viewingJob as any).image_url || undefined);
                          const iframe = document.createElement('iframe');
                          iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.style.visibility = 'hidden';
                          document.body.appendChild(iframe);
                          const doc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (!doc) throw new Error('Could not create iframe document');
                          doc.open(); doc.write(html); doc.close();
                          await new Promise<void>((res)=>{ const w = iframe.contentWindow as Window; const onLoad = ()=>{ setTimeout(res,250); }; if (w.document.readyState === 'complete') onLoad(); else w.addEventListener('load', onLoad); setTimeout(res,5000); });
                          const w = iframe.contentWindow as Window | null; if (!w) throw new Error('Iframe window not available'); try{ w.focus(); }catch{}
                          w.print(); setTimeout(()=>{ try{ iframe.remove(); } catch {} }, 1500);
                        } catch (e:any) { toast({ title: 'Échec d\'impression', description: e.message || String(e), variant: 'destructive' }); }
                      }}>Imprimer</Button>

                      <Button variant="outline" onClick={async ()=>{
                        if (!viewingJob) return;
                        const job = viewingJob;
                        closeReportDialog();
                        setTimeout(()=>openEditorForJob(job), 100);
                      }}>Modifier</Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;