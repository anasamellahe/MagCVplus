import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Upload, FileText, ArrowLeft, AlertCircle } from 'lucide-react';
import fr from '@/i18n/fr';
import { toast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
// AI handles extraction/enhancement server-side; no local parsing

type ResumeJSON = Json;

// No local text extraction functions; handled by edge function

type UploadPageProps = {
  hideHeader?: boolean;
};

const UploadPage = ({ hideHeader = false }: UploadPageProps) => {
  const t = fr;
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [niche, setNiche] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    if (!allowedTypes.includes(file.type)) {
    toast({ title: "Type de fichier invalide", description: "Veuillez téléverser uniquement un PDF ou DOCX.", variant: 'destructive' });
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
    toast({ title: "Fichier trop volumineux", description: "Veuillez téléverser un fichier de moins de 10 Mo.", variant: 'destructive' });
      return;
    }

    setSelectedFile(file);
    try {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    } catch (e) {}
    try {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } catch (e) {
      setFilePreviewUrl(null);
    }
  toast({ title: "Fichier prêt", description: `${file.name} est prêt pour le téléversement.` });
  }, []);

  // Handle drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) { setImageFile(null); return; }
    // basic validation (<= 5MB)
    if (!f.type.startsWith('image/')) {
      toast({ title: 'Image invalide', description: 'Veuillez sélectionner un fichier image.', variant: 'destructive' });
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (f.size > maxSize) {
      toast({ title: 'Image trop volumineuse', description: 'Max 5 Mo.', variant: 'destructive' });
      return;
    }
  // revoke previous preview
  try { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); } catch(e){}
  setImageFile(f);
  try { setImagePreviewUrl(URL.createObjectURL(f)); } catch(e){ setImagePreviewUrl(null); }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
  toast({ title: "Aucun fichier sélectionné", description: "Veuillez sélectionner un fichier de CV à téléverser.", variant: 'destructive' });
      return;
    }

    // Require niche to be provided
    if (!niche || !niche.trim()) {
  toast({ title: 'Niche requise', description: 'Veuillez saisir votre domaine professionnel pour continuer.', variant: 'destructive' });
      return;
    }

    if (!user) {
  toast({ title: "Authentification requise", description: "Veuillez vous connecter pour téléverser des fichiers.", variant: 'destructive' });
      return;
    }

    setIsUploading(true);

  try {
      // Create a resume job record first
      const nicheValue = niche.trim() || null; // snapshot per resume
  // derive enhancer display name from profile (if available) or fallback to email prefix
  const { data: jobData, error: jobError } = await supabase
        .from('resume_jobs')
        .insert({
          user_id: user.id,
            original_filename: selectedFile.name,
            prompt: prompt.trim() || 'Améliorez mon CV pour le rendre plus professionnel et attractif pour les recruteurs : mettez en valeur mes compétences, responsabilités et réalisations chiffrées, et adaptez le ton au poste visé.',
            status: 'processing',
            niche: nicheValue,
            enhancer_display_name: (await (async () => {
              try {
                const { data: p } = await supabase.from('profiles').select('display_name').eq('user_id', user.id).single();
                return (p as any)?.display_name || user.email?.split('@')[0] || null;
              } catch (e) {
                return user.email?.split('@')[0] || null;
              }
            })())
        })
        .select()
        .single();

  // remember current job id so Cancel can delete it if needed
  if (jobData?.id) setCurrentJobId(jobData.id as string);

      // Optionally also persist latest niche to profile (comment out if you want profile niche stable)
      if (nicheValue) {
        await supabase.from('profiles').update({ niche: nicheValue }).eq('user_id', user.id);
      }

      if (jobError || !jobData) {
        toast({ title: 'Échec du téléversement', description: jobError?.message || 'Impossible de créer la tâche.', variant: 'destructive' });
        return;
      }

      // Upload original file to storage bucket 'resumes'
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const path = `${user.id}/${jobData.id}/original.${ext}`;
      const { error: storageError } = await supabase.storage.from('resumes').upload(path, selectedFile, { upsert: true, contentType: selectedFile.type });
      if (storageError) {
        console.error('Storage upload error', storageError);
        await supabase.from('resume_jobs').update({ status: 'failed', error_message: storageError.message }).eq('id', jobData.id);
        toast({ title: 'Échec du téléversement', description: storageError.message, variant: 'destructive' });
        return;
      }

      // Get public URL of uploaded source file
      const { data: pubOrig } = supabase.storage.from('resumes').getPublicUrl(path);
      const sourceUrl = pubOrig?.publicUrl || null;

      // Persist source_file_url immediately
      await supabase.from('resume_jobs').update({ source_file_url: sourceUrl }).eq('id', jobData.id);

      // Optional image upload
      if (imageFile) {
        const imgPath = `${user.id}/${jobData.id}/image/${encodeURIComponent(imageFile.name)}`;
        const { error: imgErr } = await supabase.storage.from('resumes').upload(imgPath, imageFile, { upsert: true, contentType: imageFile.type });
        if (imgErr) {
          console.warn('Image upload failed', imgErr);
        } else {
          const { data: pubImg } = supabase.storage.from('resumes').getPublicUrl(imgPath);
          const imageUrl = pubImg?.publicUrl || null;
          if (imageUrl) {
            await supabase.from('resume_jobs').update({ image_url: imageUrl }).eq('id', jobData.id);
          }
        }
      }

      // Let AI agent process the PDF and return structured JSON
      let resumeJson: ResumeJSON | null = null;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('process-resume-pdf', {
          body: { job_id: jobData.id, file_url: sourceUrl, prompt: prompt.trim() }
        });
        if (fnErr) {
          // Supabase SDK surfaces HTTP errors here. Try to extract server error body.
          console.error('process-resume-pdf returned error', fnErr);
          let serverMsg = fnErr.message || '';
          const anyErr: any = fnErr as any;
          const body = anyErr?.context?.body;
          if (body) {
            try {
              // Some runtimes return a ReadableStream here. Normalize to string.
              let txt: string;
              if (typeof body === 'string') {
                txt = body;
              } else if (body instanceof ReadableStream || (body && typeof body.getReader === 'function')) {
                // Convert ReadableStream -> string
                try {
                  txt = await new Response(body).text();
                } catch (streamErr) {
                  // Fallback: inspect as object
                  txt = JSON.stringify(body);
                }
              } else {
                txt = JSON.stringify(body);
              }
              const parsed = (() => {
                try { return JSON.parse(txt); } catch { return null; }
              })();
              if (parsed) {
                serverMsg = parsed?.error || parsed?.message || serverMsg || JSON.stringify(parsed);
                console.error('process-resume-pdf server body (json):', parsed);
              } else {
                serverMsg = txt;
                console.error('process-resume-pdf server body (text):', txt);
              }
            } catch (e2) {
              serverMsg = String(body);
              console.error('process-resume-pdf raw server body (fallback):', body, e2);
            }
          }
          toast({ title: 'Erreur de traitement', description: serverMsg || 'Erreur de la fonction Edge (voir la console)', variant: 'destructive' });
        } else {
          // SDK may return parsed JSON in data. Inspect for structured result or an error field.
          if (data?.resume_json) {
            resumeJson = data.resume_json;
            } else if (data?.error) {
            console.error('process-resume-pdf response error:', data.error);
            toast({ title: 'Erreur de traitement', description: String(data.error), variant: 'destructive' });
          } else if (data) {
            // Unexpected shape, log for debugging
            console.warn('process-resume-pdf unexpected response:', data);
            toast({ title: 'Processing', description: 'Unexpected response from processor; see console for details.' });
          }
        }
      } catch (e: any) {
        console.error('process-resume-pdf invocation failed', e);
        toast({ title: "Échec du traitement", description: e?.message || String(e), variant: 'destructive' });
      }

      // Update status only; JSON is stored by the Edge Function in storage (json_url)
      const { error: updateError } = await supabase.from('resume_jobs').update({
        status: resumeJson ? 'completed' : 'failed',
        ai_cost_cents: 0
      }).eq('id', jobData.id);
      if (updateError) {
        console.error('Job update error', updateError);
      }

      toast({
        title: resumeJson ? 'CV traité' : 'Échec du traitement',
        description: resumeJson ? "L'IA a analysé et enrichi votre CV en JSON." : "Le traitement par l'IA a échoué. Veuillez réessayer.",
      });
      // clear current job tracking after normal flow
      setCurrentJobId(null);
      navigate('/dashboard');
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Échec du téléversement', description: "Une erreur inattendue s'est produite. Veuillez réessayer.", variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel handler: if uploading, delete created job + storage objects; otherwise navigate back
  const handleCancel = async () => {
    if (!isUploading) {
      navigate('/dashboard');
      return;
    }
    // If there is no current job id yet, just stop uploading state and navigate
    if (!currentJobId) {
      setIsUploading(false);
      navigate('/dashboard');
      return;
    }
    if (!user) {
      toast({ title: t.unable_to_cancel, description: t.must_be_signed_in_cancel, variant: 'destructive' });
      return;
    }
    setCancelling(true);
    try {
      const basePath = `${user.id}/${currentJobId}`;

      const gather = async (prefix: string): Promise<string[]> => {
        try {
          const { data: items, error } = await supabase.storage.from('resumes').list(prefix);
          if (error) {
            console.warn('List storage objects failed for', prefix, error);
            return [];
          }
          const paths: string[] = [];
          for (const it of (items || [])) {
            const name = (it as any).name as string;
            const candidate = `${prefix}/${name}`;
            if (name.includes('.')) {
              paths.push(candidate);
            } else {
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
        const chunkSize = 100;
        for (let i = 0; i < dynamicPaths.length; i += chunkSize) {
          const chunk = dynamicPaths.slice(i, i + chunkSize);
          const { error: removeErr } = await supabase.storage.from('resumes').remove(chunk);
          if (removeErr) console.warn('Some storage objects may not have been removed', removeErr);
        }
      }
      // delete DB row
      const { error: delErr } = await supabase.from('resume_jobs').delete().eq('id', currentJobId).eq('user_id', user.id);
      if (delErr) {
        console.warn('Failed to delete job record on cancel', delErr);
      }
  toast({ title: t.cancelled, description: t.upload_cancelled_desc });
    } catch (e:any) {
      console.error('Cancel failed', e);
  toast({ title: t.cancel_failed, description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setCancelling(false);
      setIsUploading(false);
      setCurrentJobId(null);
      setSelectedFile(null);
      if (filePreviewUrl) { try { URL.revokeObjectURL(filePreviewUrl); } catch {} setFilePreviewUrl(null); }
      setImageFile(null);
      if (imagePreviewUrl) { try { URL.revokeObjectURL(imagePreviewUrl); } catch {} setImagePreviewUrl(null); }
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header (optional when embedded) */}
      {!hideHeader && (
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Retour au tableau de bord
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-primary">{t.upload_resume_title_page}</h1>
            </div>
          </div>
        </header>
      )}

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">{t.enhance_your_resume}</h2>
          <p className="text-muted-foreground">
            {t.upload_resume_lead}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Area */}
          <Card>
            <CardHeader>
              <CardTitle>Téléverser un CV</CardTitle>
              <CardDescription>
                Glissez-déposez votre CV ici, ou cliquez pour parcourir.
                Formats pris en charge : PDF et DOCX (max 10 Mo, 6 pages recommandées).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Resume upload area (left) - now matches image tile layout */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 transition-colors flex flex-col justify-between h-full ${
                    dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="text-center space-y-3">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-lg font-semibold">{t.upload_resume_card_title}</p>
                    <p className="text-sm text-muted-foreground">{t.drop_resume_or_select}</p>
                    <input ref={resumeInputRef} type="file" accept=".pdf,.docx,.doc" onChange={handleInputChange} className="hidden" id="resume-file-input" />

                    {selectedFile ? (
                      selectedFile.type === 'application/pdf' && filePreviewUrl ? (
                        <div className="w-full border rounded overflow-hidden mt-2">
                          <iframe src={filePreviewUrl} className="w-full h-44" title="PDF preview" />
                        </div>
                      ) : (
                        <div className="space-y-2 mt-2 text-sm text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto text-primary" />
                          <div className="font-semibold">{selectedFile.name}</div>
                          <div>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</div>
                        </div>
                      )
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button type="button" size="sm" onClick={() => resumeInputRef.current?.click()}>{selectedFile ? t.replace_file : t.choose_file}</Button>
                    {selectedFile && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => {
                        setSelectedFile(null);
                        if (filePreviewUrl) { try { URL.revokeObjectURL(filePreviewUrl); } catch(e){} setFilePreviewUrl(null); }
                        try { if (resumeInputRef && resumeInputRef.current) resumeInputRef.current.value = ''; } catch(e){}
                      }}>Supprimer</Button>
                    )}
                  </div>
                </div>

                {/* Image upload area (right) */}
                <div className={`border-2 border-dashed rounded-lg p-8 transition-colors flex flex-col justify-between h-full ${imagePreviewUrl ? '' : 'hover:border-primary/50'}`}>
                  <div className="text-center space-y-3">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-lg font-semibold">{t.optional_image}</p>
                    <p className="text-sm text-muted-foreground">{t.attach_profile_photo}</p>
                    <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="image-input-dashboard" />
                    {imagePreviewUrl && (
                      <div className="mt-3">
                        <img src={imagePreviewUrl} alt="Preview" className="h-28 w-28 object-cover rounded mx-auto" />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button type="button" size="sm" onClick={()=>imageInputRef.current?.click()}>{imagePreviewUrl ? t.replace_image : t.upload_image}</Button>
                    {imagePreviewUrl && (
                      <Button type="button" size="sm" variant="ghost" onClick={async ()=>{
                        try{ if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);}catch(e){}
                        setImageFile(null);
                        setImagePreviewUrl(null);
                        try { if (imageInputRef && imageInputRef.current) imageInputRef.current.value = ''; } catch(e){}
                      }}>Supprimer</Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start space-x-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p><strong>{t.file_requirements}</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>{t.file_format_only}</li>
                    <li>{t.file_size_max}</li>
                    <li>{t.file_pages_recommended}</li>
                    <li>{t.scanned_pdfs_supported}</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhancement Prompt */}
          <Card>
            <CardHeader>
              <CardTitle>Consignes d'amélioration</CardTitle>
              <CardDescription>
                Décrivez comment vous souhaitez que votre CV soit amélioré. Soyez précis sur le poste cible, le secteur ou les aspects particuliers à améliorer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="niche">{t.professional_niche_label}</Label>
                <Textarea
                  id="niche"
                  placeholder="ex. : Ingénierie logicielle, Marketing digital, Administration de la santé, Analyse financière..."
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  rows={2}
                  required
                  className="min-h-[60px]"
                />
                <p className="text-xs text-muted-foreground">
                  Précisez votre domaine professionnel ou secteur afin d'adapter l'amélioration.
                </p>
                {!niche?.trim() && (
                  <p className="text-xs text-destructive mt-1">La niche est requise pour traiter ce CV.</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="prompt">{t.enhancement_prompt_label}</Label>
                <Textarea
                  id="prompt"
                  placeholder="Ex. : Je postule pour des postes de senior software engineer en entreprise tech. Améliorez mon CV pour mettre en valeur mon expérience en leadership, mes compétences techniques en React et Node.js, et quantifiez mes réalisations lorsque possible."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="min-h-[100px]"
                />
              </div>
              
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">{t.pro_tips}</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t.pro_tip_target_role}</li>
                  <li>• {t.pro_tip_skills}</li>
                  <li>• {t.pro_tip_quantify}</li>
                  <li>• {t.pro_tip_formatting}</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* image upload moved into the main upload card above */}

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
                    <Button type="button" variant="outline" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? t.cancelling : t.cancel}
            </Button>
            <Button 
              type="submit" 
              disabled={!selectedFile || isUploading || !niche || !niche.trim()}
              className="min-w-[120px]"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t.processing_button}
                </>
              ) : (
                t.enhance_resume
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default UploadPage;