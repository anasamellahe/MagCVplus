import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, Download, User, LogOut, Share2, RefreshCw, Trash2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import UploadPage from './Upload';
import fr from '@/i18n/fr';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRef } from 'react';
import { generateResumeHTML } from '@/lib/resumeTemplate';
import FormationCard from '@/components/FormationCard';

interface ResumeJob {
  id: string;
  original_filename: string;
  prompt: string;
  status: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  shared: boolean;
  pdf_url?: string;
  docx_url?: string;
  text_url?: string;
  json_url?: string;
  image_url?: string;
  niche?: string; // denormalized
  owner_display_name?: string; // denormalized
  enhancer_display_name?: string; // who enhanced this resume (new)
  job_title?: string;
  user_id?: string;
}

interface UserProfile {
  display_name: string;
  email: string;
  niche: string;
}

const ClientDashboard = () => {
  const t = fr;
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [resumeJobs, setResumeJobs] = useState<ResumeJob[]>([]);
  const [sharedResumes, setSharedResumes] = useState<ResumeJob[]>([]);
  const [sharedNicheFilter, setSharedNicheFilter] = useState<string>('all');
  const [sharedNiches, setSharedNiches] = useState<string[]>([]);
  const [historyNicheFilter, setHistoryNicheFilter] = useState<string>('all');
  const [historyNiches, setHistoryNiches] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [sharedSearch, setSharedSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<ResumeJob | null>(null);
  const [editingData, setEditingData] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editImageInputRef = useRef<HTMLInputElement | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);
  // Cached JSON for report/name
  const [resumeJsonById, setResumeJsonById] = useState<Record<string, any>>({});
  // Whether to include the AI report when exporting/printing
  const [includeReportOnDownload, setIncludeReportOnDownload] = useState<boolean>(true);
  // Retry helper for JSON fetches (exponential backoff)
  async function fetchJsonWithRetry(url: string, maxRetries = 3): Promise<any> {
    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        attempt += 1;
        if (attempt > maxRetries) break;
        const backoff = 200 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }
  const [editingReport, setEditingReport] = useState<any>(null);
  const [raportJob, setRaportJob] = useState<ResumeJob | null>(null);
  // Editor search state: allows jumping to a specific field/path in the structured editor
  const [editorSearch, setEditorSearch] = useState<string>('');
  // Matches (list of element ids) and current match index for navigation
  const [editorSearchMatches, setEditorSearchMatches] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);

  // Run the editor search: populate matches and jump to first match
  const runEditorSearch = (qRaw?: string) => {
    const q = ((qRaw ?? editorSearch) || '').trim().toLowerCase();
    setEditorSearchMatches([]);
    setCurrentMatchIndex(0);
    if (!q) return;
    // find elements by data-key-lc
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
        // fallback: search label text
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
    if (found.length) {
      // go to first match
      setTimeout(()=> goToMatch(0), 80);
    } else {
      toast({ title: 'Aucun champ trouvé', description: `Aucun champ correspondant à "${q}"`, variant: 'destructive' });
    }
  };

  // Safely render brief values (prevent rendering raw objects/arrays as React children)
  const renderBriefValue = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      if (v.every(i => typeof i === 'string' || typeof i === 'number' || typeof i === 'boolean')) return v.join(', ');
      return v.map(i => {
        if (typeof i === 'string' || typeof i === 'number' || typeof i === 'boolean') return String(i);
        if (i && typeof i === 'object') {
          const keys = ['diplome','periode','specialite','etablissement','lieu','mention','details','titre','role','company'];
          const parts: string[] = [];
          for (const k of keys) if (i[k]) parts.push(String(i[k]));
          if (parts.length) return parts.join(' — ');
          try { return JSON.stringify(i); } catch { return String(i); }
        }
        return String(i);
      }).join(' ; ');
    }
    if (typeof v === 'object') {
      const keys = ['diplome','periode','specialite','etablissement','lieu','mention','details','titre','role','company'];
      const parts: string[] = [];
      for (const k of keys) if (v[k]) parts.push(String(v[k]));
      if (parts.length) return parts.join(' — ');
      try { return JSON.stringify(v); } catch { return '[objet]'; }
    }
    return String(v);
  };

  const goToMatch = (index: number) => {
    if (!editorSearchMatches || editorSearchMatches.length === 0) return;
    const idx = ((index % editorSearchMatches.length) + editorSearchMatches.length) % editorSearchMatches.length;
    const id = editorSearchMatches[idx];
    const el = id ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try {
        el.animate?.([{ background: 'rgba(247, 250, 255, 0)' }, { background: 'rgba(255, 249, 240, 0.95)' }, { background: 'rgba(247, 250, 255, 0)' }], { duration: 1200 });
      } catch {}
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
  // Bulk Excel upload state
  const [bulkRows, setBulkRows] = useState<Array<any>>([]);
  const [bulkPrompt, setBulkPrompt] = useState<string>('');
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);
  const [bulkReport, setBulkReport] = useState<any>(null);
  const [bulkSelected, setBulkSelected] = useState<any>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState<any>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Embedding Excel upload state (separate from bulk)
  const [embeddingRows, setEmbeddingRows] = useState<Array<any>>([]);
  const [embeddingProcessing, setEmbeddingProcessing] = useState<boolean>(false);
  const [embeddingReport, setEmbeddingReport] = useState<any>(null);
  const embeddingFileInputRef = useRef<HTMLInputElement | null>(null);

  // active tab for responsive control (mobile select will update this)
  const [activeTab, setActiveTab] = useState<string>('upload');

  // Mobile nav open state
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  // Multi-delete selection state
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Record<string, boolean>>({});
  const [multiDeleting, setMultiDeleting] = useState<boolean>(false);

  // Parser for embedding excel files (same logic as bulk parser but stores into embeddingRows)
  const handleEmbeddingFile = async (f: File | null) => {
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.Workbook ? ExcelJSModule : ExcelJSModule.default || ExcelJSModule;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
  if (!ws) { toast({ title: t.no_sheets_found, description: t.excel_needs_sheet, variant: 'destructive' }); return; }
      // read header row
      const headerRow = ws.getRow(1);
      const rawHeaderValues: any = (headerRow && (headerRow.values as any)) || [];
      const headerArray = Array.isArray(rawHeaderValues) ? rawHeaderValues : (rawHeaderValues ? [rawHeaderValues] : []);
      const header: string[] = headerArray.slice(1).map((v:any)=>{
        if (v && typeof v === 'object') return String((v as any).text ?? (v as any).richText?.map((t:any)=>t.text).join('') ?? '');
        return String(v ?? '');
      });
  if (!header.length) { toast({ title: t.no_header, description: t.header_required, variant: 'destructive' }); return; }
      const dataRows: any[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const obj: any = {};
        header.forEach((h, i) => { obj[h||`col${i+1}`] = row.getCell(i+1).value ?? ''; });
        const raw = header.map((h)=>`${h}: ${obj[h]||''}`).join('\n');
        dataRows.push({ row: rowNumber, raw_text: raw, data: obj, original_filename: f.name });
      });
  if (!dataRows.length) { toast({ title: t.no_rows_found, description: t.excel_needs_row, variant: 'destructive' }); return; }
  setEmbeddingRows(dataRows);
  toast({ title: t.file_parsed_title, description: t.file_parsed(dataRows.length), });
    } catch (err:any) {
      toast({ title: t.parse_failed, description: err.message || String(err), variant: 'destructive' });
    }
  };

  // Reusable parser for selected File
  const handleBulkFile = async (f: File | null) => {
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.Workbook ? ExcelJSModule : ExcelJSModule.default || ExcelJSModule;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
  if (!ws) { toast({ title: t.no_sheets_found, description: t.excel_needs_sheet, variant: 'destructive' }); return; }
      // read header row
      const headerRow = ws.getRow(1);
      // exceljs Row.values can be an array-like or other types depending on library; normalize defensively
      const rawHeaderValues: any = (headerRow && (headerRow.values as any)) || [];
      const headerArray = Array.isArray(rawHeaderValues) ? rawHeaderValues : (rawHeaderValues ? [rawHeaderValues] : []);
      const header: string[] = headerArray.slice(1).map((v:any)=>{
        if (v && typeof v === 'object') return String((v as any).text ?? (v as any).richText?.map((t:any)=>t.text).join('') ?? '');
        return String(v ?? '');
      });
  if (!header.length) { toast({ title: t.no_header, description: t.header_required, variant: 'destructive' }); return; }
      const dataRows: any[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const obj: any = {};
        header.forEach((h, i) => { obj[h||`col${i+1}`] = row.getCell(i+1).value ?? ''; });
        const raw = header.map((h)=>`${h}: ${obj[h]||''}`).join('\n');
        dataRows.push({ row: rowNumber, raw_text: raw, data: obj, original_filename: f.name });
      });
  if (!dataRows.length) { toast({ title: t.no_rows_found, description: t.excel_needs_row, variant: 'destructive' }); return; }
  setBulkRows(dataRows);
  toast({ title: t.file_parsed_title, description: t.file_parsed(dataRows.length), });
    } catch (err:any) {
      toast({ title: t.parse_failed, description: err.message || String(err), variant: 'destructive' });
    }
  };
  const [bulkSelectedEditable, setBulkSelectedEditable] = useState<any>(null);

  // Create a reasonable empty template when adding a new object to an array.
  // If the array already has objects, derive keys and types from the first item.
  // Otherwise fall back to heuristics for common resume sections (experience, formation, langues, informatique).
  const makeTemplateForArrayItem = (key: string, arr: any[]): any => {
    try {
      // If we have a sample item, clone its shape
      if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
        const sample = arr[0];
        const out: any = {};
        Object.keys(sample).forEach(k => {
          const v = sample[k];
          if (Array.isArray(v)) out[k] = [];
          else if (v && typeof v === 'object') out[k] = {};
          else out[k] = '';
        });
        return out;
      }

      const lower = (key || '').toLowerCase();
      if (lower.includes('experience') || lower.includes('experience_professionnelle') || lower.includes('professional_experience')) {
        return {
          periode_debut: '',
          periode_fin: '',
          duree: '',
          entreprise: '',
          lieu: '',
          fonction: '',
          poste: '',
          secteur: '',
          description: [],
          missions_principales: [],
          realisations: [],
          encadrement: ''
        };
      }
      if (lower.includes('formation') || lower.includes('education')) {
        return {
          periode_debut: '',
          periode_fin: '',
          intitule: '',
          etablissement: '',
          lieu: '',
          mention: '',
          description: []
        };
      }
      if (lower.includes('langue') || lower.includes('langues')) {
        return { langue: '', niveau: '' };
      }
      if (lower.includes('informatique') || lower.includes('skills') || lower.includes('competences')) {
        return { nom: '', niveau: '' };
      }

      // Default: return an empty object so the form can expand into editable keys when user adds fields inside
      return {};
    } catch (e) {
      return {};
    }
  };

  // Recursive renderer for JSON-driven form fields
  const renderObjectFields = (obj: any, setObj: (v:any)=>void, path = ''): JSX.Element | null => {
    if (!obj || typeof obj !== 'object') return null;
    const entries = Object.entries(obj);
    // If the object has no keys, expose a small UI so the user can add fields manually
    if (entries.length === 0) {
      // infer a parent key from the path to allow template population
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
                const tmpl = makeTemplateForArrayItem(parentKey, []);
                const next = JSON.parse(JSON.stringify(obj));
                // merge template keys into the empty object
                Object.assign(next, tmpl);
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
          const fieldId = `field-${fieldPath.replace(/[^\w-]/g,'_')}`;
          const formattedLabel = String(key).replace(/_/g, ' ').toUpperCase();
          if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return (
              <div key={fieldPath} id={fieldId} data-key-lc={fieldPath.toLowerCase()} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
                <Label className="text-sm">{formattedLabel}</Label>
                <Input value={String(value ?? '')} onChange={(e)=>{
                  const next = JSON.parse(JSON.stringify(obj));
                  const orig = value;
                  let newVal: any = e.target.value;
                  if (typeof orig === 'number') newVal = Number(newVal || 0);
                  if (typeof orig === 'boolean') newVal = newVal === 'true';
                  next[key] = newVal;
                  setObj(next);
                }} />
              </div>
            );
          }
          if (Array.isArray(value)) {
            return (
              <div key={fieldPath} id={fieldId} data-key-lc={fieldPath.toLowerCase()} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
                <Label className="text-sm">{(String(key).replace(/_/g,' ').toUpperCase())} (array)</Label>
                <div className="space-y-2">
                  {(value as any[]).map((item, idx) => (
                    <div key={idx} className="border p-2 rounded">
                      {typeof item === 'object' ? (
                        renderObjectFields(item, (v)=>{
                          const next = JSON.parse(JSON.stringify(obj));
                          next[key][idx] = v;
                          setObj(next);
                        }, `${fieldPath}[${idx}]`)
                      ) : (
                        <Input value={String(item || '')} onChange={(e)=>{
                          const next = JSON.parse(JSON.stringify(obj));
                          next[key][idx] = e.target.value;
                          setObj(next);
                        }} />
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button variant="destructive" onClick={()=>{
                          const next = JSON.parse(JSON.stringify(obj));
                          next[key].splice(idx,1);
                          setObj(next);
                        }}>Remove</Button>
                      </div>
                    </div>
                  ))}
                  <Button onClick={()=>{
                    const next = JSON.parse(JSON.stringify(obj));
                    const sample = Array.isArray(next[key]) ? next[key] : [];
                    // If the array is empty, try to create a template based on the key (experience/formation/etc.).
                    let item: any;
                    if (!sample || sample.length === 0) {
                      item = makeTemplateForArrayItem(key, sample);
                    } else {
                      item = (typeof sample[0] === 'object') ? makeTemplateForArrayItem(key, sample) : '';
                    }
                    next[key].push(item);
                    setObj(next);
                  }}>Add</Button>
                </div>
              </div>
            );
          }
          return (
            <div key={fieldPath} id={fieldId} data-key-lc={fieldPath.toLowerCase()} className="border-l-4 border-slate-200 pl-3 p-2 rounded">
              <Label className="text-sm">{formattedLabel}</Label>
              <div className="mt-2 space-y-2">
                {renderObjectFields(value, (v)=>{
                  const next = JSON.parse(JSON.stringify(obj));
                  next[key] = v;
                  setObj(next);
                }, fieldPath)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  // Debounce history search + niche filter
  useEffect(() => {
    const t = setTimeout(() => {
      loadDashboardData();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch, historyNicheFilter]);

  // Debounce shared library search
  useEffect(() => {
    const t = setTimeout(() => {
      loadDashboardData();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSearch]);
  const loadDashboardData = async () => {
    try {
      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, email, niche')
        .eq('user_id', user?.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error loading profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Load user's resume jobs (allow optional search by owner_display_name, job_title, or filename)
      // Precompute all niches for the history filter from the user's resumes without applying the active niche filter.
      try {
        const { data: allMyJobsForNiches } = await supabase.from('resume_jobs').select('niche').eq('user_id', user?.id);
        if (allMyJobsForNiches) {
          const hNichesAll = Array.from(new Set((allMyJobsForNiches as any[]).map(r => (r as any).niche).filter(Boolean)));
          setHistoryNiches(hNichesAll as string[]);
        }
      } catch (e) { /* ignore niche precompute errors */ }

      let myQuery: any = supabase
        .from('resume_jobs')
          .select('id, original_filename, prompt, status, error_message, created_at, updated_at, shared, pdf_url, docx_url, text_url, json_url, image_url, niche, owner_display_name, enhancer_display_name, user_id, job_title')
        .eq('user_id', user?.id);
      if (historySearch && historySearch.trim()) {
        const s = `%${historySearch.trim()}%`;
        myQuery = myQuery.or(`owner_display_name.ilike.${s},job_title.ilike.${s},original_filename.ilike.${s}`);
      }
      if (historyNicheFilter && historyNicheFilter !== 'all') {
        myQuery = myQuery.eq('niche', historyNicheFilter);
      }
      myQuery = myQuery.order('created_at', { ascending: false });
      const { data: myJobs, error: jobsErr } = await myQuery;
      if (!jobsErr && myJobs) {
        setResumeJobs(myJobs as any);
        // preload JSON for user's jobs so cards display name/title/report immediately
        (async () => {
          try {
            await Promise.allSettled((myJobs as any[]).map(async (j:any) => {
              if (!j?.json_url) return;
              try {
                const base = j.json_url as string;
                const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
                const data = await fetchJsonWithRetry(url);
                // ensure both English `report` and French `rapport` are present for UI consumers
                const normalized = { ...(data || {}) };
                if (normalized.rapport && !normalized.report) normalized.report = normalized.rapport;
                if (normalized.report && !normalized.rapport) normalized.rapport = normalized.report;
                setResumeJsonById(prev => ({ ...prev, [j.id]: normalized }));
              } catch (e) { /* ignore per-job fetch errors */ }
            }));
          } catch (e) { /* noop */ }
        })();
      }

      // Load shared resumes library
      // Load shared resumes library (allow optional search by owner_display_name or job_title)
      // Precompute all niches for the shared filter from all shared resumes (unfiltered by search) so options remain stable.
      try {
        const { data: allSharedForNiches } = await supabase.from('resume_jobs').select('niche').eq('shared', true);
        if (allSharedForNiches) {
          const allNiches = Array.from(new Set((allSharedForNiches as any[]).map(r => (r as any).niche).filter(Boolean)));
          setSharedNiches(allNiches as string[]);
        }
      } catch (e) { /* ignore */ }

      let sharedQuery: any = supabase
        .from('resume_jobs')
          .select('id, original_filename, prompt, status, error_message, created_at, updated_at, shared, pdf_url, docx_url, text_url, json_url, image_url, niche, owner_display_name, enhancer_display_name, user_id, job_title')
        .eq('shared', true);
      if (sharedSearch && sharedSearch.trim()) {
        const s2 = `%${sharedSearch.trim()}%`;
        sharedQuery = sharedQuery.or(`owner_display_name.ilike.${s2},job_title.ilike.${s2},original_filename.ilike.${s2}`);
      }
      sharedQuery = sharedQuery.order('created_at', { ascending: false });
      const { data: shared, error: sharedErr } = await sharedQuery;
      if (!sharedErr && shared) {
        setSharedResumes(shared as any);
  // Do not overwrite the precomputed full list of shared niches here — keep the full list stable so the select doesn't lose options when a filter is applied.
        // preload JSON for shared resumes so cards display name/title/report immediately
        (async () => {
          try {
            await Promise.allSettled((shared as any[]).map(async (j:any) => {
              if (!j?.json_url) return;
              try {
                const base = j.json_url as string;
                const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
                const data = await fetchJsonWithRetry(url);
                const normalized = { ...(data || {}) };
                if (normalized.rapport && !normalized.report) normalized.report = normalized.rapport;
                if (normalized.report && !normalized.rapport) normalized.rapport = normalized.report;
                setResumeJsonById(prev => ({ ...prev, [j.id]: normalized }));
              } catch (e) { /* ignore per-job fetch errors */ }
            }));
          } catch (e) { /* noop */ }
        })();
      }

    } catch (e) {
      console.error('loadDashboardData error', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleShareResume = async (jobId: string, currentShared: boolean) => {
    try {
      const { error } = await supabase
        .from('resume_jobs')
        .update({ shared: !currentShared })
        .eq('id', jobId)
        .eq('user_id', user?.id);

      if (error) {
        toast({ title: t.error, description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: currentShared ? t.resume_unshared : t.resume_shared,
          description: currentShared ? t.resume_removed_desc : t.resume_added_desc,
        });
        loadDashboardData();
      }
    } catch (error) {
      console.error('Error toggling share status:', error);
    }
  };

  const deleteResume = async (job: ResumeJob) => {
  if (!confirm(t.confirm_delete_resume)) return;
    setDeletingId(job.id);
    try {
      const basePath = `${user?.id}/${job.id}`;
      // List all objects directly under the job folder
      const { data: listData, error: listErr } = await supabase.storage.from('resumes').list(basePath);
      if (listErr) {
        console.warn('List storage objects failed', listErr);
      }
      const dynamicPaths = (listData || []).map(o => `${basePath}/${o.name}`);
      if (dynamicPaths.length) {
        const { error: removeErr } = await supabase.storage.from('resumes').remove(dynamicPaths);
        if (removeErr) console.warn('Some storage objects may not have been removed', removeErr);
      }
      // Also attempt to remove any files referenced by job URLs that may live outside the job folder
      try {
        const urlFields = ['json_url', 'image_url', 'pdf_url', 'docx_url', 'text_url', 'source_file_url'];
        const extraPaths: string[] = [];
        for (const f of urlFields) {
          const val = (job as any)[f] as string | undefined | null;
          if (!val) continue;
          try {
            // Typical public URL contains '/resumes/<path>' — extract path after that segment
            const parts = (val || '').split('/resumes/');
            if (parts.length > 1) {
              // strip query params
              const maybe = parts[1].split('?')[0];
              if (maybe && !extraPaths.includes(maybe) && !dynamicPaths.includes(maybe)) extraPaths.push(maybe);
            }
          } catch (e) { /* ignore parse errors */ }
        }
        if (extraPaths.length) {
          // remove in chunks
          const chunkSize = 100;
          for (let i = 0; i < extraPaths.length; i += chunkSize) {
            const chunk = extraPaths.slice(i, i + chunkSize);
            const { error: rem2 } = await supabase.storage.from('resumes').remove(chunk);
            if (rem2) console.warn('Failed to remove some referenced storage objects', rem2);
          }
        }
      } catch (e:any) { console.warn('Referenced file removal failed', e); }
      const { error: delErr } = await supabase.from('resume_jobs').delete().eq('id', job.id).eq('user_id', user?.id);
      if (delErr) {
    toast({ title: 'Échec de la suppression', description: delErr.message, variant: 'destructive' });
      } else {
    toast({ title: 'CV supprimé', description: 'CV et fichiers supprimés.' });
        loadDashboardData();
      }
    } catch (e:any) {
      console.error('Delete resume error', e);
      toast({ title: 'Delete Failed', description: e.message || 'Unexpected error', variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  const cancelProcessing = async (job: ResumeJob) => {
    if (!confirm(t.confirm_cancel_processing)) return;
    setCancellingId(job.id);
    try {
      const basePath = `${user?.id}/${job.id}`;

      // Recursive gather of all files under basePath to ensure nested folders are handled
      const gather = async (prefix: string): Promise<string[]> => {
        try {
          const { data: items, error } = await supabase.storage.from('resumes').list(prefix);
          if (error) {
            console.warn('List storage objects failed for', prefix, error);
            return [];
          }
          const paths: string[] = [];
          for (const it of (items || [])) {
            // Heuristic: treat names containing a dot as files, otherwise recurse into folder
            const name = (it as any).name as string;
            const candidate = `${prefix}/${name}`;
            if (name.includes('.')) {
              paths.push(candidate);
            } else {
              // likely a folder — recurse
              const nested = await gather(candidate);
              paths.push(...nested);
            }
          }
          return paths;
        } catch (e:any) {
          console.warn('Error listing prefix', prefix, e);
          return [];
        }
      };

      const dynamicPaths = await gather(basePath);
      if (dynamicPaths.length) {
        // remove in chunks to avoid request size limits
        const chunkSize = 100;
        for (let i = 0; i < dynamicPaths.length; i += chunkSize) {
          const chunk = dynamicPaths.slice(i, i + chunkSize);
          const { error: removeErr } = await supabase.storage.from('resumes').remove(chunk);
          if (removeErr) console.warn('Some storage objects may not have been removed', removeErr);
        }
      }
      const { error: delErr } = await supabase.from('resume_jobs').delete().eq('id', job.id).eq('user_id', user?.id);
      if (delErr) {
        toast({ title: t.cancel_failed, description: delErr.message, variant: 'destructive' });
      } else {
        toast({ title: t.cancelled, description: t.processing_cancelled_desc });
        loadDashboardData();
      }
    } catch (e:any) {
      console.error('Cancel processing failed', e);
      toast({ title: t.cancel_failed, description: e.message || String(e), variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const retryEnhancement = async (job: ResumeJob) => {
    if (!confirm('Retry enhancement for this resume?')) return;
      setRetryingId(job.id);
    try {
  // Refresh the job record to pick up source_file_url or storage object path
  const { data: fresh, error: freshErr } = await supabase.from('resume_jobs').select('id, pdf_url, docx_url, text_url, source_file_url, prompt, user_id').eq('id', job.id).single();
  const body: any = { job_id: job.id };
  const source = (fresh as any)?.source_file_url || (fresh as any)?.pdf_url || (fresh as any)?.docx_url || (fresh as any)?.text_url;
  if (source) body.file_url = source;
  if ((fresh as any)?.prompt) body.prompt = (fresh as any).prompt;
  // Some edge functions accept object_path for storage-refs; include if present on job (best-effort)
  if ((fresh as any)?.object_path) body.object_path = (fresh as any).object_path;
  // include user id for auth context (edge can decide how to use it)
  if ((fresh as any)?.user_id) body.user_id = (fresh as any).user_id;

      const { data, error: fnErr } = await supabase.functions.invoke('process-resume-pdf', { body });

      // Handle SDK-level function error (http-level)
      if (fnErr) {
        console.error('process-resume-pdf returned error', fnErr);
        let serverMsg = fnErr.message || '';
        const anyErr: any = fnErr as any;
        const bodyVal = anyErr?.context?.body;
        if (bodyVal) {
          try {
            let txt: string;
            if (typeof bodyVal === 'string') {
              txt = bodyVal;
            } else if (bodyVal instanceof ReadableStream || (bodyVal && typeof (bodyVal as any).getReader === 'function')) {
              try { txt = await new Response(bodyVal as any).text(); } catch (streamErr) { txt = JSON.stringify(bodyVal); }
            } else {
              txt = JSON.stringify(bodyVal);
            }
            const parsed = (() => { try { return JSON.parse(txt); } catch { return null; } })();
            if (parsed) {
              serverMsg = parsed?.error || parsed?.message || serverMsg || JSON.stringify(parsed);
              console.error('process-resume-pdf server body (json):', parsed);
            } else {
              serverMsg = txt;
              console.error('process-resume-pdf server body (text):', txt);
            }
          } catch (e2) {
            serverMsg = String(bodyVal);
            console.error('process-resume-pdf raw server body (fallback):', bodyVal, e2);
          }
        }
        // mark job as failed and write error message
        try { await supabase.from('resume_jobs').update({ status: 'failed', error_message: serverMsg }).eq('id', job.id); } catch(e){ console.warn('Failed to update job status', e); }
        toast({ title: 'Processing Error', description: serverMsg || 'Edge function error', variant: 'destructive' });
        return;
      }

      // If the function returned structured result synchronously include it
      if (data?.resume_json) {
        // optimistic: store JSON locally and mark job completed
        setResumeJsonById(prev => ({ ...prev, [job.id]: data.resume_json }));
        try { await supabase.from('resume_jobs').update({ status: 'completed', error_message: null }).eq('id', job.id); } catch(e){ console.warn('Update job to completed failed', e); }
          toast({ title: 'Relance réussie', description: 'Le CV a été retraité avec succès.' });
      } else if (data?.error) {
        try { await supabase.from('resume_jobs').update({ status: 'failed', error_message: String(data.error) }).eq('id', job.id); } catch(e){ console.warn('Update job failed', e); }
          toast({ title: 'Erreur de traitement', description: String(data.error), variant: 'destructive' });
      } else {
        // The edge function likely started async processing; set status to processing and clear error
        try { await supabase.from('resume_jobs').update({ status: 'processing', error_message: null }).eq('id', job.id); } catch(e){ console.warn('Update job processing failed', e); }
          toast({ title: 'Relance lancée', description: 'Le traitement a démarré. Revenez dans un instant.' });
      }
    } catch (e:any) {
      console.error('Retry enhancement failed', e);
        toast({ title: 'Échec de la relance', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setRetryingId(null);
      loadDashboardData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Translate internal status keys to French labels for display
  const translateStatus = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Terminé';
      case 'processing':
        return 'En cours';
      case 'failed':
        return 'Échoué';
      default:
        // capitalize fallback
        return status ? (status.charAt(0).toUpperCase() + status.slice(1)) : '';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Open structured editor for a job (loads JSON if necessary and preserves report)
  const openEditorForJob = async (job: ResumeJob) => {
    try {
      let obj: any = resumeJsonById[job.id] || {};
      if (!obj || !Object.keys(obj).length) {
        if ((job as any).json_url) {
          const base = (job as any).json_url as string;
          const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
          obj = await fetchJsonWithRetry(url);
        }
      }
      setEditImagePreviewUrl((job as any).image_url || null);
      obj = obj || {};
      // Accept French 'rapport' or English 'report' and preserve both in the editor state
      const reportVal = obj.report ?? obj.rapport ?? null;
      const rest = { ...obj };
      delete rest.report; delete rest.rapport;
      rest.personal_information = rest.personal_information || {};
      rest.skills = Array.isArray(rest.skills) ? rest.skills : [];
      rest.education = Array.isArray(rest.education) ? rest.education : [];
      rest.certifications = Array.isArray(rest.certifications) ? rest.certifications : [];
      rest.projects = Array.isArray(rest.projects) ? rest.projects : [];
      setEditingReport(reportVal || null);
      setEditingJob(job);
      setEditingData(rest);
    } catch (e:any) {
      toast({ title: 'Load Failed', description: e.message || String(e), variant: 'destructive' });
    }
  };

  // Export enhanced resume as HTML using a simple template
  const exportResumeHtml = async (job: ResumeJob) => {
    try {
      let obj: any = resumeJsonById[job.id] || {};
      if (!obj || !Object.keys(obj).length) {
        if ((job as any).json_url) {
          const base = (job as any).json_url as string;
          const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
          obj = await fetchJsonWithRetry(url);
        }
      }
      obj = obj || {};
  const pi = obj.personal_information || {};
  // Prefer new schema: profil.resume, fall back to older summary keys
  const summary = obj.profil?.resume || obj.summary || '';
  const skills = Array.isArray(obj.skills) ? obj.skills : [];
  const exp = Array.isArray(obj.professional_experience) ? obj.professional_experience : [];
  const education = Array.isArray(obj.education) ? obj.education : [];
  const projects = Array.isArray(obj.projects) ? obj.projects : [];
  const report = obj.report ?? obj.rapport ?? null;

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${(pi.full_name || job.original_filename) + ' — Enhanced Resume'}</title>
  <style>
    body{font-family:Inter,-apple-system,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#0f172a}
    .header{display:flex;gap:16px;align-items:center}
    .avatar{width:96px;height:96px;border-radius:8px;object-fit:cover}
    h1{margin:0;font-size:20px}
    h2{margin-top:18px;font-size:16px}
    .section{margin-top:12px}
    ul{margin:6px 0 0 18px}
  </style>
</head>
<body>
  <div class="header">
    ${job.image_url ? `<img src="${job.image_url}" class="avatar"/>` : ''}
    <div>
      <h1>${pi.full_name || ''}</h1>
      <div>${pi.job_title || ''}</div>
      <div>${pi.email || ''}${pi.phone?(' • '+pi.phone):''}</div>
    </div>
  </div>
  <div class="section"><h2>Résumé professionnel</h2><div>${summary}</div></div>
  <div class="section"><h2>Compétences</h2>${skills.length?('<ul>'+skills.map(s=>`<li>${s}</li>`).join('')+'</ul>'):'<div>—</div>'}</div>
  <div class="section"><h2>Expériences professionnelles</h2>${exp.length?exp.map(e=>`<div style="margin-bottom:10px"><strong>${e.job_title || e.title || ''} — ${e.company || ''}</strong><div>${(e.start_date||'')+' — '+(e.end_date||'')}</div><div>${Array.isArray(e.responsibilities)?'<ul>'+e.responsibilities.map(r=>`<li>${r}</li>`).join('')+'</ul>':(e.responsibilities||'')}</div></div>`).join(''):'<div>—</div>'}</div>
  <div class="section"><h2>Formations</h2>${education.length?('<ul>'+education.map(ed=>`<li><strong>${ed.degree||''}</strong>, ${ed.school||''} ${ed.start_date?('('+ed.start_date+(ed.end_date?(' — '+ed.end_date):')')):''}</li>`).join('')+'</ul>'):'<div>—</div>'}</div>
  ${report?`<div class="section"><h2>Rapport</h2><div>${report.summary||''}</div>${Array.isArray(report.recommended_roles)?'<div style="margin-top:8px"><strong>Rôles recommandés:</strong><ul>'+report.recommended_roles.map((r:any)=>`<li>${r.title}${r.seniority?(' ('+r.seniority+')'):''}${typeof r.match_score==='number'?(' — '+r.match_score+'%'):''} — ${r.why||''}</li>`).join('')+'</ul></div>':''}</div>`:''}
</body>
</html>`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(pi.full_name || job.original_filename || 'resume').replace(/[^a-z0-9-_\.]/gi,'_')}_enhanced.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e:any) {
      toast({ title: 'Export Failed', description: e.message || String(e), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary">MagCV+</h1>
              <Badge variant="secondary">Tableau de bord client</Badge>
            </div>

            {/* Desktop right-side */}
            <div className="hidden sm:flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span className="text-sm">{profile?.display_name || user?.email?.split('@')[0] || 'User'}</span>
              </div>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Se déconnecter
              </Button>
            </div>

            {/* Mobile hamburger */}
            <div className="sm:hidden flex items-center">
              <button
                className="p-2 rounded-md border bg-background/60"
                onClick={() => setMobileNavOpen(v => !v)}
                aria-label="Ouvrir le menu"
                aria-expanded={mobileNavOpen}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
            </div>
          </div>

          {/* end container */}
        </div>
        {/* Mobile full-width stacked menu */}
        {mobileNavOpen && (
          <div className="sm:hidden border-t bg-background/95 supports-[backdrop-filter]:backdrop-blur z-30">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5" />
                  <div>
                    <div className="font-medium">{profile?.display_name || user?.email?.split('@')[0] || 'User'}</div>
                    <div className="text-xs text-muted-foreground">{user?.email}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Se déconnecter</Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            Bienvenue, {profile?.display_name || user?.email?.split('@')[0] || 'Utilisateur'}!
          </h2>
          <p className="text-muted-foreground">
            Transformez votre CV avec des améliorations par IA et explorez les CV partagés par d'autres utilisateurs.
          </p>
          {/* profile niche removed from header to avoid duplicate label display */}
        </div>

  <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(String(v))} className="space-y-6">
    {/* Desktop tabs: visible on sm+ */}
    <TabsList className="hidden sm:flex sm:justify-start">
      <TabsTrigger value="upload">{t.upload_process}</TabsTrigger>
      <TabsTrigger value="bulk">{t.bulk_excel}</TabsTrigger>
      <TabsTrigger value="embedding">{t.embedding_excel}</TabsTrigger>
      <TabsTrigger value="my-resumes">{t.my_resumes}</TabsTrigger>
      <TabsTrigger value="shared">{t.shared_library}</TabsTrigger>
    </TabsList>

    {/* Mobile select: visible on xs screens - use portal-backed Select to avoid offscreen dropdown */}
    <div className="sm:hidden mb-3">
      <label className="sr-only">Onglets</label>
      <Select value={activeTab} onValueChange={(v) => setActiveTab(String(v))}>
        <SelectTrigger className="w-full h-9">
          <SelectValue placeholder={t.upload_process} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="upload">{t.upload_process}</SelectItem>
          <SelectItem value="bulk">{t.bulk_excel}</SelectItem>
          <SelectItem value="embedding">{t.embedding_excel}</SelectItem>
          <SelectItem value="my-resumes">{t.my_resumes}</SelectItem>
          <SelectItem value="shared">{t.shared_library}</SelectItem>
        </SelectContent>
      </Select>
    </div>

          <TabsContent value="upload">
            {/* Render the full Upload page UI inline inside the Dashboard upload tab */}
            <UploadPage hideHeader />
          </TabsContent>

          <TabsContent value="bulk">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="h-5 w-5 mr-2 text-primary" />
                  {t.bulk_excel} Téléversement
                </CardTitle>
                  <CardDescription>
                  {"Téléversez un fichier Excel (.xlsx) où chaque ligne représente un candidat. Les colonnes correspondent aux champs. Nous extrairons les lignes et utiliserons l'IA pour choisir le meilleur CV en fonction de votre invite."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 items-stretch w-full">
                    <div className="col-span-full w-full border rounded p-4 h-full">
                      <div className="w-full">
                        <label className="text-xs mb-1 block text-muted-foreground">Fichier Excel</label>
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex flex-col items-center">
                                              <div className="flex flex-col items-center cursor-pointer" onClick={() => bulkFileInputRef.current?.click()}>
                                                <Upload className="h-10 w-10 mb-2 text-muted-foreground" />
                                                <Button onClick={() => bulkFileInputRef.current?.click()}>Choisir un fichier</Button>
                                                <input ref={bulkFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e)=>{ const f = e.target.files?.[0]; handleBulkFile(f || null); }} />
                                              </div>
                          </div>
                          <div className="text-sm text-muted-foreground text-center">
                            {bulkRows.length ? <span>{bulkRows.length} lignes chargées</span> : <span>Aucun fichier choisi</span>}
                            {bulkRows.length===0 && <div className="text-xs">Formats pris en charge : .xlsx, .xls — ligne d'en-tête requise</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 border rounded p-4 h-full">
                        <label className="text-xs mb-1 block text-muted-foreground">{t.selection_prompt}</label>
                        <Textarea value={bulkPrompt} onChange={(e)=>setBulkPrompt(e.target.value)} placeholder="Décrivez le poste ou les critères pour choisir le meilleur CV" />
                      <div className="text-xs text-muted-foreground mt-2">{t.tip_specific}</div>
                    </div>
                  </div>

                  {/* Preview of uploaded rows */}
                  {bulkRows && bulkRows.length > 0 && (
                    <div className="border rounded p-3 bg-background/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Aperçu ({Math.min(bulkRows.length, 5)} de {bulkRows.length} lignes)</div>
                        <div className="text-xs text-muted-foreground">Affiche les 5 premières lignes</div>
                      </div>
                      <div className="overflow-auto">
                        <table className="table-auto w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              {(() => {
                                const first = bulkRows[0];
                                const keys = (first && first.data && typeof first.data === 'object') ? Object.keys(first.data) : (first && Array.isArray(first.row) ? first.row.map((_:any,i:number)=>`Col ${i+1}`) : []);
                                return keys.map((k:any)=> (<th key={String(k)} className="px-2 py-1 text-left">{String(k)}</th>));
                              })()}
                            </tr>
                          </thead>
                          <tbody>
                            {bulkRows.slice(0,5).map((r:any, idx:number) => {
                              const cells = r && r.data && typeof r.data === 'object' ? Object.values(r.data) : (Array.isArray(r.row) ? r.row : []);
                              return (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  {cells.map((c:any,i:number)=>(<td key={i} className="px-2 py-1 truncate max-w-xs">{(c===null||c===undefined)?'':String(c)}</td>))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                      <div className="flex gap-2 items-center">
                    <Button className="h-9" onClick={async ()=>{
                      // Original model-based selection (evaluate-candidates)
                      if (!bulkRows || bulkRows.length===0) { toast({ title: 'No rows', description: 'Please upload an excel file first', variant: 'destructive' }); return; }
                      if (!bulkPrompt || bulkPrompt.trim().length<3) { toast({ title: 'Prompt required', description: 'Please add a selection prompt', variant: 'destructive' }); return; }
                      setBulkProcessing(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('evaluate-candidates', { body: { rows: bulkRows.map(r=>({ raw_text: r.raw_text, row: r.row, original_filename: r.original_filename })), prompt: bulkPrompt } });
                        if (error) throw error;
                        if (!data?.best_candidate) throw new Error('No resume returned');
                        const chosen = data.best_candidate;
                        const report = data.comparison_report || { summary: 'Selected by AI' };
                        setBulkSelected(chosen);
                        // persist chosen candidate to storage and create resume_job record (like earlier flow)
                        const evalId = data.evaluation_id || null;
                        const candidateNameForSlug = (chosen?.personal_information?.full_name) || chosen?.original_filename || 'bulk-selected';
                        const deriveSlug = (s: any) => {
                          if (!s) return `bulk-selected`;
                          try {
                            return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80) || 'bulk-selected';
                          } catch { return 'bulk-selected'; }
                        };
                        const slug = evalId ? `eval-${evalId}` : deriveSlug(candidateNameForSlug);
                        const filename = `${slug}.json`;
                        const storageKey = `${user?.id}/bulk/${filename}`;
                        const { data: upRes, error: upErr } = await supabase.storage.from('resumes').upload(storageKey, new File([JSON.stringify(chosen, null, 2)], filename, { type: 'application/json' }), { upsert: true });
                        if (upErr) throw upErr;
                        const { data: pub } = supabase.storage.from('resumes').getPublicUrl(storageKey);
                        const jsonUrl = pub?.publicUrl ? `${pub.publicUrl}?ts=${Date.now()}` : null;
                        const { data: insert, error: insertErr } = await supabase.from('resume_jobs').insert([{ original_filename: filename, prompt: bulkPrompt, status: 'completed', user_id: user?.id, json_url: jsonUrl, shared: false, enhancer_display_name: profile?.display_name || user?.email?.split('@')[0] }]).select('id').single();
                        if (insertErr) throw insertErr;
                        const newJob = insert as any;
                        const enriched = { ...(chosen as any), __storage_key: storageKey, __json_url: jsonUrl, __job_id: newJob?.id };
                        setBulkSelected(enriched);
                        setBulkSelectedEditable(null);
                        toast({ title: 'Choice stored', description: `Chosen resume saved.` });
                        setBulkReport({ chosenEvalId: evalId, report: report, top: data?.comparison_report?.close_alternatives || [] });
                        if (data?.parseError) toast({ title: 'Model parse warning', description: data.parseError, variant: 'destructive' });
                        loadDashboardData();
                      } catch (err:any) {
                        toast({ title: 'Processing failed', description: err.message || String(err), variant: 'destructive' });
                      } finally { setBulkProcessing(false); }
                    }}>{bulkProcessing ? 'Traitement...' : t.choose_best_resume}</Button>

                    <Button className="h-9" variant="ghost" onClick={()=>{ setBulkRows([]); setBulkPrompt(''); setBulkReport(null); }}>{t.reset}</Button>
                  </div>

                  {/* Embedding results preview */}
                  {bulkReport && bulkReport.byEmbedding && bulkReport.results && (
                    <div className="mt-4 border rounded p-3 bg-background/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Correspondances par embedding (top 3 par formation)</div>
                          <div className="text-xs text-muted-foreground">Affiche les 3 meilleures correspondances</div>
                      </div>
                      <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                        {bulkReport.results.map((r:any, idx:number)=> (
                          <div key={idx} className="border rounded p-2">
                            <div className="text-xs text-muted-foreground mb-1">Formation #{idx+1}</div>
                            <div className="text-sm mb-2 truncate">{String(r.formation).slice(0,240)}</div>
                            {(!r.top || r.top.length===0) && <div className="text-xs text-muted-foreground">Aucune correspondance</div>}
                            {r.top && r.top.map((t:any, i:number)=> (
                              <div key={i} className="flex items-center justify-between text-sm py-1">
                                <div>
                                  <div className="font-medium">{t.job?.owner_display_name || t.job?.original_filename || t.job_id}</div>
                                  <div className="text-xs text-muted-foreground">{t.job?.niche || ''}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm">{(t.score||0).toFixed(3)}</div>
                                  <div className="text-xs text-muted-foreground">#{i+1}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  
                  {/* Selected resume card */}
                  {bulkSelected && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                      {/* Left: editable structured format (like resume editor) */}
                      <div className="col-span-2 border rounded p-4 h-full">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">Modifier le CV sélectionné</h3>
                            <div className="text-sm text-muted-foreground">Modifiez directement les champs avant d'enregistrer ou de télécharger</div>
                          </div>
                          <div className="flex gap-2">
                            <Button className="h-9" variant="outline" onClick={()=>{
                              const filename = (bulkSelectedEditable?.personal_information?.full_name || bulkSelected.personal_information?.full_name || 'selected') + '.json';
                              const blob = new Blob([JSON.stringify(bulkSelectedEditable || bulkSelected, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
                            }}>Télécharger JSON</Button>
                            <Button className="h-9" variant="ghost" onClick={async ()=>{
                              const html = generateResumeHTML(bulkSelectedEditable || bulkSelected, (bulkSelectedEditable || bulkSelected).image_url);
                              const iframe = document.createElement('iframe');
                              iframe.style.position = 'fixed';
                              iframe.style.right = '0';
                              iframe.style.bottom = '0';
                              iframe.style.width = '0';
                              iframe.style.height = '0';
                              iframe.style.border = '0';
                              iframe.style.visibility = 'hidden';
                              document.body.appendChild(iframe);
                              const doc = iframe.contentDocument || iframe.contentWindow?.document;
                              if (!doc) { toast({ title: 'Échec', description: 'Impossible de préparer le PDF', variant: 'destructive' }); return; }
                              doc.open(); doc.write(html); doc.close();
                              await new Promise<void>((res) => {
                                const w = iframe.contentWindow as Window;
                                const onLoad = () => { setTimeout(res, 250); };
                                if (w.document.readyState === 'complete') onLoad(); else w.addEventListener('load', onLoad);
                                setTimeout(res, 5000);
                              });
                              try {
                                const w = iframe.contentWindow as Window | null;
                                if (!w) throw new Error('Iframe not available');
                                try { w.focus(); } catch {}
                                w.print();
                              } catch (e:any) {
                                console.error(e);
                                toast({ title: "Échec de l'impression", description: e?.message || String(e), variant: 'destructive' });
                              } finally {
                                setTimeout(()=>{ try{ iframe.remove(); }catch{} }, 1500);
                              }
                            }}>Télécharger PDF</Button>
                          </div>
                        </div>
                        <div className="mt-3 text-sm prose max-w-none">
                          {(bulkSelected.profil?.resume || bulkSelected.summary) && <p><strong>Summary:</strong> {bulkSelected.profil?.resume || bulkSelected.summary}</p>}
                        </div>
                        <div className="mt-4">
                          {/* Editable structured fields - constrained scrollable area */}
                          <div className="max-h-[60vh] overflow-y-auto pr-2">
                            {renderObjectFields(bulkSelectedEditable || bulkSelected, (v)=>{ setBulkSelectedEditable(v); })}
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button className="h-9" onClick={async ()=>{
                            // save edited (or original if not edited) to storage and update existing resume_job when possible
                            try {
                              setBulkSaving(true);
                              const toSave = bulkSelectedEditable || bulkSelected;

                              const deriveSlug = (s: any) => {
                                if (!s) return `bulk-selected`;
                                try {
                                  return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80) || 'bulk-selected';
                                } catch { return 'bulk-selected'; }
                              };

                              const candidateName = (toSave?.personal_information?.full_name) || (toSave?.original_filename) || '';
                              const slug = deriveSlug(candidateName || Date.now());
                              const fallbackStorageKey = `${user?.id}/bulk/${slug}.json`;

                              // Try to detect an existing storage path or job to update. Prefer metadata on the in-memory object.
                              let existingJobId: string | null = null;
                              let existingStorageKey: string | null = null;
                              try {
                                // 1) Prefer explicit metadata if present (set when the job was first created by this flow)
                                if ((toSave as any)?.__job_id) existingJobId = String((toSave as any).__job_id);
                                if ((toSave as any)?.__storage_key) existingStorageKey = String((toSave as any).__storage_key);
                                if ((toSave as any)?.__json_url && !existingStorageKey) {
                                  const parts = String((toSave as any).__json_url).split('/resumes/');
                                  if (parts.length > 1) existingStorageKey = parts[1].split('?')[0];
                                }

                                // 2) If metadata not present, try json_url fields on the object
                                if (!existingStorageKey) {
                                  const possibleUrl = (toSave as any)?.json_url || (toSave as any)?.source_json_url || null;
                                  if (possibleUrl) {
                                    const parts = String(possibleUrl).split('/resumes/');
                                    if (parts.length > 1) existingStorageKey = parts[1].split('?')[0];
                                  }
                                }

                                // 3) Try to find a matching job by exact filename or json_url path
                                if (!existingJobId && !existingStorageKey) {
                                  const filenameExact = `${slug}.json`;
                                  const { data: matchByFilename } = await supabase.from('resume_jobs').select('id,json_url,original_filename').eq('user_id', user?.id).eq('original_filename', filenameExact).limit(1);
                                  if (matchByFilename && matchByFilename.length > 0) {
                                    existingJobId = (matchByFilename as any)[0].id;
                                    const jurl = (matchByFilename as any)[0].json_url;
                                    if (jurl) {
                                      const p = String(jurl).split('/resumes/');
                                      if (p.length > 1) existingStorageKey = p[1].split('?')[0];
                                    }
                                  }
                                }

                                if (!existingJobId && !existingStorageKey) {
                                  const { data: matches2 } = await supabase.from('resume_jobs').select('id,json_url').eq('user_id', user?.id).ilike('json_url', `%/bulk/${slug}.json%`).limit(1);
                                  if (matches2 && matches2.length > 0) {
                                    existingJobId = (matches2 as any)[0].id;
                                    const jurl = (matches2 as any)[0].json_url;
                                    if (jurl) existingStorageKey = String(jurl).split('/resumes/')[1].split('?')[0];
                                  }
                                }
                              } catch (e) {
                                console.warn('Error while searching for existing job to update', e);
                              }

                              const storageKeyToUse = existingStorageKey ? existingStorageKey : fallbackStorageKey;
                              const filename2 = storageKeyToUse.split('/').pop() || `${slug}.json`;

                              const { error: upErr } = await supabase.storage.from('resumes').upload(storageKeyToUse, new File([JSON.stringify(toSave, null, 2)], filename2, { type: 'application/json' }), { upsert: true });
                              if (upErr) throw upErr;
                              const { data: pub2 } = supabase.storage.from('resumes').getPublicUrl(storageKeyToUse);
                              const jsonUrl2 = pub2?.publicUrl ? `${pub2.publicUrl}?ts=${Date.now()}` : null;

                              // Update existing job if found, otherwise insert
                              try {
                                if (existingJobId) {
                                  const { error: updErr } = await supabase.from('resume_jobs').update({ original_filename: filename2, prompt: bulkPrompt, status: 'completed', json_url: jsonUrl2 }).eq('id', existingJobId);
                                  if (updErr) throw updErr;
                                  toast({ title: 'Saved', description: 'Selected resume updated.' });
                                  loadDashboardData();
                                  return;
                                }
                                const { data: foundByJson } = await supabase.from('resume_jobs').select('id').eq('user_id', user?.id).ilike('json_url', `%${storageKeyToUse}%`).limit(1);
                                if (foundByJson && foundByJson.length > 0) {
                                  const id = (foundByJson as any)[0].id;
                                  const { error: upd2 } = await supabase.from('resume_jobs').update({ original_filename: filename2, prompt: bulkPrompt, status: 'completed', json_url: jsonUrl2 }).eq('id', id);
                                  if (upd2) throw upd2;
                                  toast({ title: 'Saved', description: 'Selected resume updated.' });
                                  loadDashboardData();
                                  return;
                                }
                              } catch (e) {
                                console.warn('Failed to update existing resume_job, will insert new one', e);
                              }

                              const { error: insertErr2 } = await supabase.from('resume_jobs').insert([{ original_filename: filename2, prompt: bulkPrompt, status: 'completed', user_id: user?.id, json_url: jsonUrl2, shared: false, enhancer_display_name: profile?.display_name || user?.email?.split('@')[0] }]);
                              if (insertErr2) throw insertErr2;
                              toast({ title: 'Saved', description: 'Selected resume saved to your jobs' });
                              loadDashboardData();
                            } catch (e:any) { toast({ title: 'Save failed', description: e.message || String(e), variant: 'destructive' }); }
                            finally { setBulkSaving(false); }
                          }}>{bulkSaving ? 'Enregistrement...' : 'Enregistrer dans Mes CV'}</Button>
              <Button className="h-9" variant="ghost" onClick={()=>{ setBulkSelected(null); setBulkReport(null); setBulkRows([]); setBulkPrompt(''); setBulkSelectedEditable(null); }}>Effacer la sélection</Button>
                        </div>
                      </div>
                      {/* Right: full report */}
            <div className="col-span-1 border rounded p-4 h-full">
                        <div className="text-sm font-medium mb-2">Rapport de sélection</div>
                        <div className="text-xs text-muted-foreground mb-3">Résumé et recommandations générés par l'IA pour ce CV.</div>
                        {bulkReport ? (() => {
                          const rep = bulkReport.report;
                          if (!rep) return (<div className="text-sm text-muted-foreground">Aucun rapport pour le moment.</div>);
                          if (typeof rep === 'string') return (<div className="whitespace-pre-wrap text-sm">{rep}</div>);
                          return (
                            <div className="space-y-3 text-sm">
                              {rep.summary && <div><strong>Résumé</strong><div className="whitespace-pre-wrap">{rep.summary}</div></div>}
                              {/* Why chosen / explanation */}
                              { (rep.choice_reason || rep.why_chosen || rep.choice_explanation || rep.why) ? (
                                <div>
                                  <div className="font-medium">Pourquoi ce candidat a été choisi</div>
                                  <div className="whitespace-pre-wrap">{rep.choice_reason || rep.why_chosen || rep.choice_explanation || rep.why}</div>
                                </div>
                              ) : (bulkReport.raw_model_content ? (
                                <div>
                                  <div className="font-medium">Explication du modèle</div>
                                  <div className="whitespace-pre-wrap text-xs bg-slate-50 p-2 rounded">{bulkReport.raw_model_content}</div>
                                </div>
                              ) : null)}

                              {Array.isArray(rep.strengths) && rep.strengths.length > 0 && (
                                <div>
                                  <div className="font-medium">Forces</div>
                                  <ul className="list-disc pl-6">{rep.strengths.map((s:any,i:number)=>(<li key={i}>{s}</li>))}</ul>
                                </div>
                              )}

                              {Array.isArray(rep.gaps) && rep.gaps.length > 0 && (
                                <div>
                                  <div className="font-medium">Lacunes</div>
                                  <ul className="list-disc pl-6">{rep.gaps.map((g:any,i:number)=>(<li key={i}>{g}</li>))}</ul>
                                </div>
                              )}

                              {Array.isArray(rep.recommended_roles) && rep.recommended_roles.length > 0 && (
                                <div>
                                  <div className="font-medium">Rôles recommandés</div>
                                  <ul className="list-disc pl-6">
                                    {rep.recommended_roles.map((r:any, idx:number)=> (
                                      <li key={idx}><span className="font-medium">{r.title}</span>{r.seniority?` (${r.seniority})`:''}{typeof r.match_score==='number'?` — ${r.match_score}%`:''}{r.why?`: ${r.why}`:''}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Top 3 alternatives with reasons */}
                              {Array.isArray(rep.close_alternatives) && rep.close_alternatives.length > 0 && (
                                <div>
                                  <div className="font-medium">Top alternatives (pourquoi elles étaient proches)</div>
                                  <ol className="list-decimal pl-6">
                                    {rep.close_alternatives.slice(0,3).map((c:any, i:number) => (
                                      <li key={i} className="mb-1">Ligne #{c.index}{c.reason ? ` — ${c.reason}` : ''}{c.score ? ` (${c.score})` : ''}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                          <div className="text-sm text-muted-foreground">Aucun rapport disponible</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embedding">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="h-5 w-5 mr-2 text-primary" />
                  Importer Formations
                </CardTitle>
                <CardDescription>
                  Chargez un fichier Excel (.xlsx) où chaque ligne décrit une formation. Nous analyserons automatiquement ces informations et les comparerons aux CV disponibles dans la base de données afin d’identifier les meilleures correspondances.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 w-full">
                  <div className="w-full border rounded p-4 h-full">
                    <div className="w-full">
                      <label className="text-xs mb-1 block text-muted-foreground">Excel file</label>
                      <div className="flex flex-col items-center gap-2 mt-2">
                        <div className="flex flex-col items-center">
                          <div className="flex flex-col items-center cursor-pointer" onClick={() => embeddingFileInputRef.current?.click()}>
                            <Upload className="h-10 w-10 mb-2 text-muted-foreground" />
                            <Button onClick={() => embeddingFileInputRef.current?.click()}>Choisir un fichier</Button>
                            <input ref={embeddingFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e)=>{ const f = e.target.files?.[0]; handleEmbeddingFile(f || null); }} />
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground text-center w-full mt-2">
                          {embeddingRows.length ? <span>{embeddingRows.length} lignes chargées</span> : <span>Aucun fichier choisi</span>}
                          {embeddingRows.length===0 && <div className="text-xs">Formats pris en charge : .xlsx, .xls — ligne d'en-tête requise</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview of uploaded rows */}
                  {embeddingRows && embeddingRows.length > 0 && (
                    <div className="border rounded p-3 bg-background/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Aperçu ({Math.min(embeddingRows.length, 5)} de {embeddingRows.length} lignes)</div>
                        <div className="text-xs text-muted-foreground">Affiche les 5 premières lignes</div>
                      </div>
                      <div className="overflow-auto">
                        <table className="table-auto w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              {(() => {
                                const first = embeddingRows[0];
                                const keys = (first && first.data && typeof first.data === 'object') ? Object.keys(first.data) : (first && Array.isArray(first.row) ? first.row.map((_:any,i:number)=>`Col ${i+1}`) : []);
                                return keys.map((k:any)=> (<th key={String(k)} className="px-2 py-1 text-left">{String(k)}</th>));
                              })()}
                            </tr>
                          </thead>
                          <tbody>
                            {embeddingRows.slice(0,5).map((r:any, idx:number) => {
                              const cells = r && r.data && typeof r.data === 'object' ? Object.values(r.data) : (Array.isArray(r.row) ? r.row : []);
                              return (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  {cells.map((c:any,i:number)=>(<td key={i} className="px-2 py-1 truncate max-w-xs">{(c===null||c===undefined)?'':String(c)}</td>))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                    <div className="flex gap-2 items-center">
                    <Button className="h-9" onClick={async ()=>{
                      if (!embeddingRows || embeddingRows.length===0) { toast({ title: 'No rows', description: 'Please upload an excel file first', variant: 'destructive' }); return; }
                      setEmbeddingProcessing(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('evaluate-by-embedding', { body: { rows: embeddingRows.map((r:any)=>({ raw_text: r.raw_text, row: r.row, original_filename: r.original_filename })) } });
                        if (error) throw error;
                        if (!data?.results) throw new Error('No results returned');
                        setEmbeddingReport(data.results);
                        toast({ title: 'Embedding selection complete', description: `Found matches for ${data.results.length} formations.` });
                      } catch (err:any) {
                        toast({ title: 'Processing failed', description: err.message || String(err), variant: 'destructive' });
                      } finally { setEmbeddingProcessing(false); }
                    }}>{embeddingProcessing ? 'Traitement...' : 'Rechercher des correspondances'}</Button>

                    <Button className="h-9" variant="ghost" onClick={()=>{ setEmbeddingRows([]); setEmbeddingReport(null); }}>Réinitialiser</Button>
                  </div>

                  {/* Embedding results preview */}
                  {embeddingReport && (
                    <div className="mt-4 border rounded p-3 bg-background/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Correspondances par embedding (top 3 par formation)</div>
                        <div className="text-xs text-muted-foreground">Affiche les 3 meilleures correspondances</div>
                      </div>
                      <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                        {embeddingReport.map((r:any, idx:number) => (
                          <FormationCard key={idx} formation={r} index={idx} />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my-resumes">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Historique de candidatures</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => { loadDashboardData(); }} className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t.reload}
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Suivez et gérez vos demandes d'amélioration de CV
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="w-full md:w-64">
                       <Label className="text-xs mb-1 block">Filtrer par niche</Label>
                      <Select value={historyNicheFilter} onValueChange={setHistoryNicheFilter}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Toutes les formations" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Toutes les formations</SelectItem>
                          {historyNiches.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          {historyNiches.length === 0 && <SelectItem value="__none" disabled>Aucune formation</SelectItem>}
                        </SelectContent>
                      </Select>
                      <div className="mt-2">
                        {resumeJobs.filter(r => historyNicheFilter==='all' || (r as any).niche === historyNicheFilter).length > 0 && (
                          <Button size="sm" variant={multiSelectMode ? 'destructive' : 'outline'} onClick={() => { setMultiSelectMode(v=>{ if (v) setMultiSelectedIds({}); return !v; }); }}>
                            {multiSelectMode ? 'Annuler la sélection' : 'Sélectionner plusieurs'}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground md:self-center">
                      {resumeJobs.length} total • Filtrés: {resumeJobs.filter(r => historyNicheFilter==='all' || (r as any).niche === historyNicheFilter).length}
                    </div>
                    <div className="w-full md:w-64">
                      <label className="text-xs mb-1 block text-muted-foreground">Rechercher</label>
                      <Input placeholder="Rechercher par nom, intitulé de poste ou nom de fichier..." value={historySearch} onChange={(e)=>setHistorySearch(e.target.value)} />
                    </div>
                  </div>
                </div>
                {resumeJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Aucun CV pour le moment</h3>
                    <p className="text-muted-foreground mb-4">
                      Téléversez votre premier CV pour commencer les améliorations par IA
                    </p>
                    <Link to="/upload">
                      <Button>Importer un CV</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Delete selected bar */}
                    {multiSelectMode && Object.keys(multiSelectedIds).filter(id => multiSelectedIds[id]).length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded">
                        <div className="text-sm">{Object.keys(multiSelectedIds).filter(id => multiSelectedIds[id]).length} sélectionné(s)</div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={async () => {
                            if (!confirm('Supprimer les CV sélectionnés ? Cette action est irréversible.')) return;
                            setMultiDeleting(true);
                            const ids = Object.keys(multiSelectedIds).filter(id => multiSelectedIds[id]);
                            try {
                              for (const id of ids) {
                                // reuse existing deleteResume logic where possible
                                const job = resumeJobs.find(r => r.id === id);
                                if (!job) continue;
                                // attempt to delete storage objects then DB row
                                try {
                                  const basePath = `${user?.id}/${id}`;
                                  const { data: listData } = await supabase.storage.from('resumes').list(basePath);
                                  const dynamicPaths = (listData || []).map(o => `${basePath}/${o.name}`);
                                  if (dynamicPaths.length) {
                                    const chunkSize = 100;
                                    for (let i = 0; i < dynamicPaths.length; i += chunkSize) {
                                      const chunk = dynamicPaths.slice(i, i + chunkSize);
                                      await supabase.storage.from('resumes').remove(chunk);
                                    }
                                  }
                                } catch (e) { /* ignore per-job storage errors */ }
                                try { await supabase.from('resume_jobs').delete().eq('id', id).eq('user_id', user?.id); } catch (e) { /* ignore */ }
                              }
                              toast({ title: 'Supprimé', description: 'Les CV sélectionnés ont été supprimés.' });
                              setMultiSelectedIds({}); setMultiSelectMode(false);
                              loadDashboardData();
                            } catch (e:any) {
                              toast({ title: 'Erreur', description: e?.message || String(e), variant: 'destructive' });
                            } finally { setMultiDeleting(false); }
                          }}>{multiDeleting ? 'Suppression...' : 'Supprimer sélection'}</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setMultiSelectedIds({}); setMultiSelectMode(false); }}>Annuler</Button>
                        </div>
                      </div>
                    )}
                    {resumeJobs.map((job) => {
                      const json = resumeJsonById[job.id];
                      const candidateName = job.owner_display_name || json?.personal_information?.full_name || job.original_filename;
                      const avatar = (job as any).image_url || '/placeholder.svg';
                      const reportSnippet: string | null = json?.report?.summary || (typeof json?.report === 'string' ? json?.report : null) || json?.rapport?.summary || (typeof json?.rapport === 'string' ? json?.rapport : null) || null;
                      const formatType = job.pdf_url ? 'PDF' : job.docx_url ? 'DOCX' : job.text_url ? 'Text' : 'Unknown';
                      return (
                      <div
                        key={job.id}
                        className="relative border rounded-lg p-4 hover:shadow-md transition-shadow"
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={async (e) => {
                          try {
                            if (!(resumeJsonById[job.id]) && (job as any).json_url) {
                              const base = (job as any).json_url as string;
                              const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
                              const data = await fetchJsonWithRetry(url);
                              setResumeJsonById(prev => ({ ...prev, [job.id]: data }));
                            }
                          } catch (e) {
                            /* ignore per-job fetch errors */
                          }
                          // if multi-select mode and clicking anywhere, toggle selection instead of opening report
                          if (multiSelectMode) {
                            setMultiSelectedIds(prev => ({ ...prev, [job.id]: !prev[job.id] }));
                            return;
                          }
                          setRaportJob(job);
                        }}
                        role="button"
                      >

                        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <img src={avatar} alt="Avatar" className="h-12 w-12 md:h-9 md:w-9 rounded object-cover border flex-shrink-0" onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                            <div className="min-w-0">
                              <h4 className="font-semibold truncate max-w-[240px] md:max-w-[260px]" title={candidateName}>{candidateName}</h4>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{renderBriefValue(formatType)}</span>
                                <span>•</span>
                                <span>{new Date(job.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 md:mt-0 flex items-center space-x-2 flex-shrink-0">
                            <Badge className={getStatusColor(job.status)}>
                              {translateStatus(job.status)}
                            </Badge>
                            {job.status === 'completed' && (
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleShareResume(job.id, job.shared); }}>
                                <Share2 className="h-4 w-4 mr-2" />
                                {job.shared ? 'Retirer' : 'Partagé'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {(json?.personal_information?.job_title || job.job_title || job.prompt) ? (
                          <p className="text-sm text-muted-foreground mb-2 truncate">
                            <strong>Titre du poste :</strong> {json?.personal_information?.job_title || job.job_title || job.prompt || "inconnue"}
                          </p>
                        ) : null}
                        {job.error_message && (
                          <p className="text-sm text-red-600 mb-2">
                            <strong>Error:</strong> {job.error_message}
                          </p>
                        )}
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                          <div className="text-xs text-muted-foreground mb-2 md:mb-0 md:max-w-[60%]">
                            {reportSnippet ? (
                              <span title={reportSnippet} className="line-clamp-2 max-w-[520px]">
                                {reportSnippet}
                              </span>
                            ) : (
                              <span>Créé: {formatDate(job.created_at)}</span>
                            )}
                          </div>
                          {job.status === 'completed' && (
                            <div className="flex flex-wrap gap-2 items-center">
                              {job.pdf_url && (
                                <a href={job.pdf_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                  <Button size="sm" variant="outline">
                                    <Download className="h-4 w-4 mr-2" />PDF
                                  </Button>
                                </a>
                              )}
                              {job.docx_url && (
                                <a href={job.docx_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                  <Button size="sm" variant="outline">
                                    <Download className="h-4 w-4 mr-2" />DOCX
                                  </Button>
                                </a>
                              )}
                              {job.text_url && (
                                <a href={job.text_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                  <Button size="sm" variant="outline">
                                    <Download className="h-4 w-4 mr-2" />Text
                                  </Button>
                                </a>
                              )}
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="destructive" disabled={deletingId===job.id} onClick={(e)=>{ e.stopPropagation(); deleteResume(job); }}>
                                  <Trash2 className="h-4 w-4 mr-1" />{deletingId===job.id?'Suppression...':'Supprimer'}
                                </Button>
                                {multiSelectMode && (
                                  <input type="checkbox" checked={!!multiSelectedIds[job.id]} onChange={(ev)=>{ ev.stopPropagation(); setMultiSelectedIds(prev=>({ ...prev, [job.id]: ev.target.checked })); }} className="form-checkbox h-4 w-4" aria-label={`Select ${job.id}`} />
                                )}
                              </div>
                            </div>
                          )}
                            {job.status === 'processing' && (
                              <div className="flex flex-wrap gap-2 items-center">
                                <Button size="sm" variant="outline" disabled={cancellingId===job.id} onClick={(e)=>{ e.stopPropagation(); cancelProcessing(job); }}>
                                  {cancellingId===job.id ? t.cancelling : t.cancel}
                                </Button>
                              </div>
                            )}
                          {job.status === 'failed' && (
                            <div className="flex flex-wrap gap-2 items-center">
                              <Button size="sm" variant="outline" disabled={retryingId===job.id} onClick={(e)=>{ e.stopPropagation(); retryEnhancement(job); }}>
                                {retryingId===job.id ? 'Retrying...' : 'Retry'}
                              </Button>
                              <Button size="sm" variant="destructive" disabled={deletingId===job.id} onClick={(e)=>{ e.stopPropagation(); deleteResume(job); }}>
                                <Trash2 className="h-4 w-4 mr-1" />{deletingId===job.id?'Suppression...':'Supprimer'}
                              </Button>
                            </div>
                          )}
                        </div>
                        {/* inline expanded mini-report removed */}
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shared">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Base de CV partagés</CardTitle>
                  <div>
                    <Button size="sm" variant="outline" onClick={() => { loadDashboardData(); }} className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t.reload}
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Explorez et téléchargez les CV améliorés partagés par d'autres utilisateurs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="w-full md:w-64">
                    <label className="text-xs mb-1 block text-muted-foreground">Filtrer par formation</label>
                    <select
                      value={sharedNicheFilter}
                      onChange={(e)=>setSharedNicheFilter(e.target.value)}
                      className="w-full border rounded-md h-9 px-2 bg-background"
                    >
                      <option value="all">Toutes les formations</option>
                      {sharedNiches.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="text-xs text-muted-foreground md:self-center">
                    {sharedResumes.length} total • Filtrés: {sharedResumes.filter(r => sharedNicheFilter==='all' || (r as any).niche === sharedNicheFilter).length}
                  </div>
                  <div className="w-full md:w-64">
                    <label className="text-xs mb-1 block text-muted-foreground">Rechercher</label>
                    <Input placeholder="Search by name or job title..." value={sharedSearch} onChange={(e)=>setSharedSearch(e.target.value)} />
                  </div>
                </div>
                {sharedResumes.length === 0 ? (
                  <div className="text-center py-8">
                    <Share2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Aucun CV partagé pour le moment</h3>
                    <p className="text-muted-foreground">Aucun utilisateur n'a encore partagé de CV amélioré.</p>
                  </div>
                ) : sharedResumes.filter(r => sharedNicheFilter==='all' || (r as any).niche === sharedNicheFilter).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun CV partagé ne correspond à la niche sélectionnée.</p>
                ) : (
                  <div className="space-y-4">
                    {sharedResumes
                      .filter(r => sharedNicheFilter==='all' || (r as any).niche === sharedNicheFilter)
                      .map((resume) => {
                      const json = resumeJsonById[resume.id];
                      const candidateName = (resume as any).owner_display_name || json?.personal_information?.full_name || resume.original_filename;
                      const formation = (resume as any).niche || json?.niche || json?.personal_information?.job_title || resume.prompt || '';
                      const reportSnippet: string | null = json?.report?.summary || (typeof json?.report === 'string' ? json?.report : null) || json?.rapport?.summary || (typeof json?.rapport === 'string' ? json?.rapport : null) || null;
                      const avatar = (resume as any).image_url || '/placeholder.svg';
                      const fullTs = new Date(resume.created_at).toLocaleString('en-US', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true });
                      return (
                      <div
                        key={resume.id}
                        className={`border rounded-lg p-4 hover:shadow-md transition-shadow`}
                        role="button"
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={async ()=>{
                          try {
                            if (!(resumeJsonById[resume.id]) && (resume as any).json_url) {
                              const base = (resume as any).json_url as string;
                              const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
                              const data = await fetchJsonWithRetry(url);
                              setResumeJsonById(prev => ({ ...prev, [resume.id]: data }));
                            }
                          } catch {}
                          setRaportJob(resume);
                        }}
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <img src={avatar} alt="Avatar" className="h-12 w-12 md:h-9 md:w-9 rounded object-cover border flex-shrink-0" onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                            <div className="min-w-0">
                              <h4 className="font-semibold truncate max-w-[240px] md:max-w-[260px]" title={candidateName}>{candidateName}</h4>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{formation || '—'}</span>
                                <span>•</span>
                                <span>{fullTs}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 md:mt-0 flex-shrink-0">
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              <Share2 className="h-3 w-3 mr-1" />
                              Partagé
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 truncate">
                          <strong>Formation :</strong> {renderBriefValue(formation)}
                        </p>
                        <p className="text-sm text-muted-foreground mb-2">
                          <strong>Amélioré par :</strong> { (resume as any).enhancer_display_name || (resume as any).owner_display_name || (resume as any).display_name || 'Inconnu' }
                        </p>
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                          <div className="text-xs text-muted-foreground mb-2 md:mb-0">
                            <span>Partagé: {formatDate(resume.created_at)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(resume as any).pdf_url && (
                              <a href={(resume as any).pdf_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-2" />PDF</Button>
                              </a>
                            )}
                            {(resume as any).docx_url && (
                              <a href={(resume as any).docx_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-2" />DOCX</Button>
                              </a>
                            )}
                            {(resume as any).text_url && (
                              <a href={(resume as any).text_url} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()}>
                                <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-2" />Text</Button>
                              </a>
                            )}
                            {resume.status === 'failed' && user?.id === (resume as any).user_id && (
                              <Button size="sm" variant="outline" disabled={retryingId===(resume as any).id} onClick={(e)=>{ e.stopPropagation(); retryEnhancement(resume as any); }}>
                                {retryingId===(resume as any).id ? 'Retrying...' : 'Retry'}
                              </Button>
                            )}
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
      </main>
      {/* Edit Resume Dialog (structured) */}
      {/* Raport Modal */}
      <Dialog open={!!raportJob} onOpenChange={(open)=>{ if (!open) setRaportJob(null); }}>
        <DialogContent className="max-w-xl" onClick={(e)=>e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>rapport</DialogTitle>
          </DialogHeader>
          {raportJob && (
            <div className="space-y-4">
              <DialogDescription>Résumé et recommandations générés par l’IA à propos de ce CV</DialogDescription>
              <div className="flex items-center gap-3">
                <img src={(raportJob as any).image_url || '/placeholder.svg'} onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} className="h-12 w-12 rounded object-cover border" />
                  <div>
                  <div className="font-semibold">{raportJob.owner_display_name || (resumeJsonById[raportJob.id]?.personal_information?.full_name) || raportJob.original_filename}</div>
                  <div className="text-xs text-muted-foreground">{new Date(raportJob.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="text-sm space-y-2">
                {(() => {
                  const data = resumeJsonById[raportJob.id];
                  // accept either English `report` or French `rapport`
                  let rep: any = data?.report ?? data?.rapport ?? null;
                  if (!rep) return <p className="text-muted-foreground">Aucun rapport pour le moment</p>;
                  if (typeof rep === 'string') return <p className="whitespace-pre-wrap">{rep}</p>;

                  // Normalize French-keyed report shapes into the expected English fields
                  const normalized: any = (() => {
                    // already in expected shape
                    if (!rep || typeof rep === 'string') return rep;
                    if (rep.summary || rep.strengths || rep.gaps || rep.recommended_roles) return rep;

                    const out: any = {};
                    out.summary = rep.summary || rep.sommaire || rep.resume || '';
                    out.strengths = Array.isArray(rep.strengths) ? rep.strengths : (Array.isArray(rep.forces) ? rep.forces : []);
                    out.gaps = Array.isArray(rep.gaps) ? rep.gaps : (Array.isArray(rep.lacunes) ? rep.lacunes : []);
                    const roles = rep.recommended_roles || rep.roles_recommandes || rep.roles || [];
                    out.recommended_roles = Array.isArray(roles) ? roles.map((r:any) => ({
                      title: r.title || r.titre || r.name || '',
                      seniority: r.seniority || r.niveau || undefined,
                      match_score: r.match_score ?? r.score_de_compatibilite ?? r.score ?? undefined,
                      why: r.why || r.pourquoi || undefined,
                    })) : [];
                    return out;
                  })();

                  const rep2 = normalized;
                  return (
                    <div className="space-y-2">
                      {rep2.summary && <p className="whitespace-pre-wrap">{rep2.summary}</p>}
                      {Array.isArray(rep2.strengths) && rep2.strengths.length > 0 && (
                        <div>
                          <div className="font-medium">Forces</div>
                          <ul className="list-disc pl-6">{rep2.strengths.map((s:string, i:number)=>(<li key={i}>{s}</li>))}</ul>
                        </div>
                      )}
                      {Array.isArray(rep2.gaps) && rep2.gaps.length > 0 && (
                        <div>
                          <div className="font-medium">Lacunes</div>
                          <ul className="list-disc pl-6">{rep2.gaps.map((s:string, i:number)=>(<li key={i}>{s}</li>))}</ul>
                        </div>
                      )}
                      {Array.isArray(rep2.recommended_roles) && rep2.recommended_roles.length > 0 && (
                        <div>
                          <div className="font-medium">Rôles recommandés</div>
                          <ul className="list-disc pl-6">
                            {rep2.recommended_roles.slice(0,5).map((r:any, idx:number)=> (
                              <li key={idx}><span className="font-medium">{r.title}</span>{r.seniority?` (${r.seniority})`:''}{typeof r.match_score==='number'?` — ${r.match_score}%`:''}{r.why?`: ${r.why}`:''}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <input id="include-report-raport" type="checkbox" checked={includeReportOnDownload} onChange={(e)=>setIncludeReportOnDownload(e.target.checked)} className="h-4 w-4" />
                <label htmlFor="include-report-raport" className="text-xs text-muted-foreground">Inclure le rapport dans le PDF</label>
              </div>
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <Button onClick={()=>{
                    if (!raportJob) return;
                    const data = resumeJsonById[raportJob.id] || {};
                    const used = includeReportOnDownload ? data : (() => { const c = JSON.parse(JSON.stringify(data || {})); if (c) { delete c.report; delete c.rapport; } return c; })();
                    const blob = new Blob([JSON.stringify(used, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const safeName = (data?.personal_information?.full_name || raportJob.original_filename || 'enhanced-resume').replace(/\s+/g,'-');
                    a.href = url; a.download = `${safeName}.json`;
                    document.body.appendChild(a); a.click();
                    a.remove(); URL.revokeObjectURL(url);
                  }}>Exporter</Button>

                  <Button onClick={async ()=>{
                    if (!raportJob) return;
                    try {
                      const data = resumeJsonById[raportJob.id] || {};
                      const used = includeReportOnDownload ? data : (() => { const c = JSON.parse(JSON.stringify(data || {})); if (c) { delete c.report; delete c.rapport; } return c; })();
                      const html = generateResumeHTML(used, (raportJob as any).image_url || undefined);

                      // Create an off-screen iframe (virtual print window) and render the HTML into it.
                      // This avoids opening a new browser tab while still allowing the browser print dialog.
                      const iframe = document.createElement('iframe');
                      // Keep it in the document but hidden and non-intrusive to layout.
                      iframe.style.position = 'fixed';
                      iframe.style.right = '0';
                      iframe.style.bottom = '0';
                      iframe.style.width = '0';
                      iframe.style.height = '0';
                      iframe.style.border = '0';
                      iframe.style.visibility = 'hidden';
                      document.body.appendChild(iframe);

                      const doc = iframe.contentDocument || iframe.contentWindow?.document;
                      if (!doc) throw new Error('Could not create iframe document');
                      doc.open(); doc.write(html); doc.close();

                      // Wait for images/fonts to load inside the iframe. Use a small timeout after load to be safe.
                      await new Promise<void>((res) => {
                        const w = iframe.contentWindow as Window;
                        const onLoad = () => { setTimeout(res, 250); };
                        if (w.document.readyState === 'complete') onLoad(); else w.addEventListener('load', onLoad);
                        setTimeout(res, 5000); // fallback
                      });

                      const w = iframe.contentWindow as Window | null;
                      if (!w) throw new Error('Iframe window not available');
                      // Focus then trigger print on the iframe's window; browser will open print dialog (Ctrl+P-like)
                      try { w.focus(); } catch (e) { /* ignore focus errors */ }
                      // Calling print() from the same origin iframe should show the print dialog without opening a new tab.
                      w.print();

                      // Remove the iframe shortly after to clean up (give print dialog time to start).
                      setTimeout(() => { try { iframe.remove(); } catch (e) { /* ignore */ } }, 1500);
                    } catch (e:any) {
                      console.error(e);
                      toast({ title: 'Print Failed', description: e?.message || String(e), variant: 'destructive' });
                    }
                  }}>Imprimer</Button>

                  <Button variant="outline" onClick={async ()=>{
                    if (!raportJob) return;
                    const job = raportJob;
                    setRaportJob(null);
                    // allow modal to close before opening editor
                    setTimeout(()=>openEditorForJob(job), 100);
                  }}>Modifier</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingJob} onOpenChange={(open)=>{ if (!open) { setEditingJob(null); setEditingData(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Modifier le CV</DialogTitle>
            <DialogDescription>Modifier les champs du CV structurés extraits par l’IA.</DialogDescription>
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
                        <div className="text-sm">Current image</div>
                        <div className="flex gap-2 mt-2">
                          <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e)=>{
                            const f = e.target.files?.[0];
                            if (!f) return;
                            // upload new image and replace
                            try {
                              const jobId = editingJob?.id;
                              if (!jobId) return;
                              // attempt to remove previous image path if possible
                              if (editingJob?.image_url) {
                                try {
                                  const parts = editingJob.image_url.split('/resumes/');
                                  const maybePath = parts.length>1? parts[1] : null;
                                  if (maybePath) await supabase.storage.from('resumes').remove([maybePath]);
                                } catch(e){ console.warn('old image delete failed', e); }
                              }
                              const imgPath = `${user?.id}/${jobId}/image/${encodeURIComponent(f.name)}`;
                              const { error: upErr } = await supabase.storage.from('resumes').upload(imgPath, f, { upsert: true, contentType: f.type });
                              if (upErr) throw upErr;
                              const { data: pub } = supabase.storage.from('resumes').getPublicUrl(imgPath);
                              const newUrl = pub?.publicUrl || null;
                              if (newUrl) {
                                await supabase.from('resume_jobs').update({ image_url: newUrl }).eq('id', jobId);
                                setEditImagePreviewUrl(newUrl);
                                // update local editingJob so subsequent replaces can remove correctly
                                setEditingJob({...editingJob, image_url: newUrl} as any);
                              }
                            } catch (err:any) {
                              toast({ title: 'Image Replace Failed', description: err.message || String(err), variant: 'destructive' });
                            }
                          }} />
                          <Button onClick={()=>editImageInputRef.current?.click()}>Remplacer l’image</Button>
                          <Button variant="ghost" onClick={async ()=>{
                            // remove image
                            if (!editingJob?.id) return;
                            try {
                              if (editingJob.image_url) {
                                const parts = editingJob.image_url.split('/resumes/');
                                const maybePath = parts.length>1? parts[1] : null;
                                if (maybePath) await supabase.storage.from('resumes').remove([maybePath]);
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
                      <div className="text-sm text-muted-foreground">Pas d’image importée</div>
                      <div className="mt-2">
                        <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e)=>{
                          const f = e.target.files?.[0];
                          if (!f || !editingJob?.id) return;
                          try {
                            const jobId = editingJob.id;
                            const imgPath = `${user?.id}/${jobId}/image/${encodeURIComponent(f.name)}`;
                            const { error: upErr } = await supabase.storage.from('resumes').upload(imgPath, f, { upsert: true, contentType: f.type });
                            if (upErr) throw upErr;
                            const { data: pub } = supabase.storage.from('resumes').getPublicUrl(imgPath);
                            const newUrl = pub?.publicUrl || null;
                            if (newUrl) {
                              await supabase.from('resume_jobs').update({ image_url: newUrl }).eq('id', jobId);
                              setEditImagePreviewUrl(newUrl);
                              setEditingJob({...editingJob, image_url: newUrl} as any);
                            }
                          } catch (err:any) { toast({ title: 'Image Upload Failed', description: err.message || String(err), variant: 'destructive' }); }
                        }} />
                        <Button onClick={()=>editImageInputRef.current?.click()}>Importer une image</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic JSON-driven editor */}
              <div className="space-y-3">
                {/* Compact sticky search/navigation bar (Enter-to-search + disabled states) */}
                <div className="flex items-center gap-2 sticky top-2 bg-white p-2 rounded z-20 border border-slate-200 shadow-sm">
                  <Input
                    placeholder="Rechercher un champ"
                    value={editorSearch}
                    onChange={(e)=>setEditorSearch(e.target.value)}
                    onKeyDown={(e)=>{ if (e.key === 'Enter') { e.preventDefault(); runEditorSearch(); } }}
                    className="max-w-xs"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label="Rechercher"
                      size="sm"
                      className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${!editorSearch.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={()=>runEditorSearch()}
                      disabled={!editorSearch.trim()}
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                    <Button
                      aria-label="Précédent"
                      size="sm"
                      className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={()=>navigateMatch(-1)}
                      disabled={editorSearchMatches.length === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="text-sm text-black px-2">{editorSearchMatches.length ? `${currentMatchIndex+1}/${editorSearchMatches.length}` : '0/0'}</div>
                    <Button
                      aria-label="Suivant"
                      size="sm"
                      className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={()=>navigateMatch(1)}
                      disabled={editorSearchMatches.length === 0}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    aria-label="Effacer"
                    size="sm"
                    className={`h-8 w-8 p-0 flex items-center justify-center bg-white text-black border border-slate-200 hover:bg-slate-100 rounded ${!editorSearch && editorSearchMatches.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={()=>{ setEditorSearch(''); setEditorSearchMatches([]); setCurrentMatchIndex(0); }}
                    disabled={!editorSearch && editorSearchMatches.length === 0}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/** Render object fields recursively */}
                {renderObjectFields(editingData, setEditingData)}
              </div>
            </div>
          )}
          <DialogFooter>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" onClick={()=>{ setEditingJob(null); setEditingData(null); }}>{t.cancel}</Button>
        <Button disabled={savingEdit} onClick={async ()=>{
                if (!editingJob) return;
                setSavingEdit(true);
                try {
          // Merge with existing JSON so we preserve the report field and any untouched data
          let existing: any = resumeJsonById[editingJob.id];
          if (!existing && (editingJob as any).json_url) {
            try {
              const base = (editingJob as any).json_url as string;
              const url = base.includes('?') ? `${base}&ts=${Date.now()}` : `${base}?ts=${Date.now()}`;
              existing = await fetchJsonWithRetry(url);
            } catch {}
          }
          const payload = { ...(existing || {}), ...(editingData || {}) };
          if (existing && existing.report !== undefined && (editingData as any)?.report === undefined) {
            payload.report = existing.report;
          }
          if (editingJob.shared) {
            // Call Edge Function to update original shared resume (service role)
            const { data, error } = await supabase.functions.invoke('update-shared-resume', { body: { job_id: editingJob.id, json: payload } });
            if (error || (data as any)?.error) {
              throw new Error((error?.message || (data as any)?.error) || 'Failed to update shared resume');
            }
            toast({ title: 'Saved', description: 'Shared resume updated for everyone.' });
          } else {
            // Prefer overwriting the original storage JSON if present (so edits don't create a new bulk file)
            // Determine existing storage key from metadata or job.json_url
            let existingStorageKey: string | null = null;
            try {
              if ((editingData as any)?.__storage_key) existingStorageKey = String((editingData as any).__storage_key);
              if (!existingStorageKey && (editingData as any)?.__json_url) {
                const parts = String((editingData as any).__json_url).split('/resumes/');
                if (parts.length > 1) existingStorageKey = parts[1].split('?')[0];
              }
              if (!existingStorageKey && (editingJob as any)?.json_url) {
                const parts = String((editingJob as any).json_url).split('/resumes/');
                if (parts.length > 1) existingStorageKey = parts[1].split('?')[0];
              }
            } catch (e) { /* ignore parse errors */ }

            // If we found an existing storage key, overwrite that file; otherwise fall back to per-job path
            const ownerPrefix = `${user?.id}/${editingJob.id}`;
            const storageKeyToUse = existingStorageKey || `${ownerPrefix}/json.json`;
            const filenameForUpload = storageKeyToUse.split('/').pop() || `${editingJob.id}.json`;
            const file = new File([JSON.stringify(payload, null, 2)], filenameForUpload, { type: 'application/json' });
            const { error: upErr } = await supabase.storage.from('resumes').upload(storageKeyToUse, file, { upsert: true, contentType: 'application/json', cacheControl: '0' });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('resumes').getPublicUrl(storageKeyToUse);
            const newJsonUrl = pub?.publicUrl ? `${pub.publicUrl}?ts=${Date.now()}` : null;
            await supabase.from('resume_jobs').update({ json_url: newJsonUrl }).eq('id', editingJob.id);
            toast({ title: 'Saved', description: 'Resume updated.' });
          }
                  setEditingJob(null); setEditingData(null);
                  loadDashboardData();
                } catch (e:any) {
                  toast({ title: 'Save Failed', description: e.message || String(e), variant: 'destructive' });
                } finally { setSavingEdit(false); }
              }}>{savingEdit ? 'Saving...' : 'Save'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientDashboard;