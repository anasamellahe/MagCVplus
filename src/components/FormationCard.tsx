import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { generateResumeHTML } from '@/lib/resumeTemplate';

interface FormationCardProps {
  formation: any;
  index: number;
}

const FormationCard: React.FC<FormationCardProps> = ({ formation, index }) => {
  const handleDownloadPDF = async (job: any) => {
    if (!job) return;

    // If job has a direct PDF URL, fetch blob and trigger download (no new window)
    if (job.pdf_url) {
      try {
        const res = await fetch(job.pdf_url);
        if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (job.original_filename && job.original_filename.endsWith('.pdf')) ? job.original_filename : `${(job.owner_display_name || 'resume').replace(/[^a-z0-9]+/gi,'_')}.pdf`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      } catch (err:any) {
        alert('Erreur lors du téléchargement du PDF: ' + (err?.message || err));
        return;
      }
    }

    // Create a hidden iframe synchronously to avoid popup blockers
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    try {
      // initial loading message so user sees something if print is delayed
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.body) {
        doc.body.innerHTML = `<div style="font-family:system-ui;padding:20px;"><h3>Préparation du PDF…</h3></div>`;
      } else if (doc) {
        // fallback if body isn't available yet
        doc.open();
        doc.write(`<div style="font-family:system-ui;padding:20px;"><h3>Préparation du PDF…</h3></div>`);
        doc.close();
      }

      // Try to find structured JSON for this job
      const candidates = [job.json_url, (job as any).__json_url, job.source_json_url, job.raw_json_url].filter(Boolean) as string[];
      let dataForTemplate: any = job;

      if (candidates.length > 0) {
        const url = candidates[0];
        const fetchUrl = url.includes('?') ? `${url}&ts=${Date.now()}` : `${url}?ts=${Date.now()}`;
        const res = await fetch(fetchUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Échec du téléchargement du JSON (${res.status})`);
        dataForTemplate = await res.json();
      } else if (!(job.personal_information || job.personal || job.informations_personnelles)) {
        // No structured data available — show helpful message in iframe
        if (doc && doc.body) {
          doc.body.innerHTML = `<div style="font-family:system-ui;padding:20px;"><h3>Aucune donnée JSON trouvée</h3><p>Impossible de générer le PDF pour ce CV. Assurez-vous que le champ <code>json_url</code> est présent et accessible.</p></div>`;
        } else if (doc) {
          doc.open();
          doc.write(`<div style="font-family:system-ui;padding:20px;"><h3>Aucune donnée JSON trouvée</h3><p>Impossible de générer le PDF pour ce CV. Assurez-vous que le champ <code>json_url</code> est présent et accessible.</p></div>`);
          doc.close();
        }
        setTimeout(()=>{ try { document.body.removeChild(iframe); } catch(e){} }, 1500);
        return;
      }

      // Render HTML into the iframe and call print
      const finalHtml = generateResumeHTML(dataForTemplate, dataForTemplate.image_url || job.image_url);
      const docFinal = iframe.contentDocument || iframe.contentWindow?.document;
      if (!docFinal) throw new Error('Impossible d\'obtenir le document de l\'iframe');
      docFinal.open();
      docFinal.write(finalHtml);
      docFinal.close();

      // Wait a short moment for resources to render, then call print on iframe window
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('print failed', e);
          alert('Impossible d\'ouvrir la boîte d\'impression.');
        } finally {
          // Remove iframe after some time to allow print dialog to start
          setTimeout(()=>{ try { document.body.removeChild(iframe); } catch(e){} }, 1000);
        }
      }, 700);
    } catch (err:any) {
      alert('Erreur lors de la préparation du PDF: ' + (err?.message || err));
      try { document.body.removeChild(iframe); } catch(e){}
    }
  };

  // split the raw formation text into a short title and a description (if present)
  const formationText = String(formation?.formation || '');
  const [formationTitle, ...formationRest] = formationText.split(/\r?\n/);
  const formationDescription = formationRest.join(' ').trim();

  return (
    <div className="bg-background/40 border  hover:border-border rounded-lg p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge className="bg-primary/10 text-primary px-2 py-1">{index + 1} Formation </Badge>
          <div className="mt-1">
            <div className="text-sm font-semibold text-ellipsis overflow-hidden whitespace-nowrap max-w-2xl">{formationTitle}</div>
            {formationDescription ? (
              <div className="text-xs text-muted-foreground mt-1 max-w-2xl line-clamp-2">{formationDescription}</div>
            ) : null}
          </div>
        </div>

        
      </div>

      <div className="mt-3 space-y-2">
        {(!formation.top || formation.top.length === 0) && (
          <div className="text-xs text-muted-foreground">Aucune correspondance</div>
        )}

        {formation.top && formation.top.map((t: any, i: number) => (
          <div key={i} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 border hover:border-border rounded-lg shadow-sm hover:shadow-md transition">
            <div className="col-span-9 flex items-center gap-3 min-w-0">
              <img src={t.job?.image_url || '/placeholder.svg'} alt="avatar" className="h-12 w-12 rounded object-cover border" onError={(e)=>{ (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
              <div className="min-w-0">
                <div className="font-medium truncate max-w-[420px]">{t.job?.owner_display_name || t.job?.original_filename || t.job_id}</div>
                <div className="text-xs text-muted-foreground">{t.job?.niche || ''}</div>
              </div>
            </div>

            <div className="col-span-3 flex flex-col items-end space-y-2">
              <Badge className="bg-primary/10 text-primary px-2 py-1">{(t.score || 0).toFixed(3)}</Badge>
              <Button size="sm" className="mt-1" onClick={() => handleDownloadPDF(t.job)}>
                Télécharger le PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FormationCard;
