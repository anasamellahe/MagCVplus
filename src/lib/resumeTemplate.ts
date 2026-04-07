export function generateResumeHTML(data: any, imageUrl?: string): string {
  // Extract personal information
  const pi = data?.personal_info || {};
  const contact = pi?.contact || {};
  
  // Build full name
  const fullName = `${pi.prenom || ''} ${pi.nom || ''}`.trim() || 'NOM PRÉNOM';
  
  // Extract profile information
  const profil = data?.profil || {};
  // Use `profil.resume` as the short introduction / summary for the candidate
  const summary = profil?.resume || profil?.summary || profil?.competency_summary || profil?.about_me || '';
  
  // Extract competences
  const competences = data?.competences || {};
  const allSkills = [
    ...(competences?.domaines_competences || []),
    ...(competences?.competences_techniques || []),
    ...(competences?.competences_humaines || []),
    ...(competences?.soft_skills || [])
  ];
  
  // Extract experience
  const experience = data?.experience_professionnelle || [];
  const domainesExperience = data?.domaines_experience || [];
  const experienceFormation = data?.experience_formation || [];
  const missionsPartinentes = data?.missions_pertinentes || [];
  const entreprisesFormees = data?.entreprises_formees || [];
  
  // Extract formation
  const formation = data?.formation || [];
  const formationsComplementaires = data?.formations_complementaires || [];
  
  // Extract other sections
  const langues = data?.langues || [];
  const informatique = data?.informatique || {};
  const references = data?.references || [];
  const centresInteret = data?.centres_interet || [];
  const distinctions = data?.distinctions_prix || [];
  const realisations = data?.realisations_principales || [];
  const travauxRecherche = data?.travaux_recherche || [];
  const activitesParaPro = data?.activites_para_professionnelles || {};
  const autresInfo = data?.autres_informations || {};
  // Rapport may be provided by the model under French or English keys
  const rapport = data?.rapport || data?.report || null;
  
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]!));

  // Generate experience HTML
  const experienceHtml = experience.map(exp => {
    const period = exp.periode || `${exp.periode_debut || ''}${exp.periode_fin ? ' - ' + exp.periode_fin : ''}`.trim();
    return `
    <div class="work-entry">
      <div class="entry-row">
        <div class="entry-title">${esc(exp.fonction || exp.poste || exp.titre || exp.entreprise || '')}</div>
        <div class="entry-date">${esc(period || '')}</div>
      </div>
      <div class="entry-body">
        ${exp.entreprise ? `<div class="entry-place">${esc(exp.entreprise)}${exp.lieu ? ' — ' + esc(exp.lieu) : ''}</div>` : (exp.lieu ? `<div class="entry-place">${esc(exp.lieu)}</div>` : '')}
        ${exp.secteur ? `<div class="entry-sector">${esc(exp.secteur)}</div>` : ''}
        ${Array.isArray(exp.missions_principales) && exp.missions_principales.length ? `
          <ul class="entry-list">
            ${exp.missions_principales.map((m: string) => `<li>${esc(m)}</li>`).join('')}
          </ul>
        ` : ''}
        ${Array.isArray(exp.realisations) && exp.realisations.length ? `
          <ul class="achievements">
            ${exp.realisations.map((r: string) => `<li>${esc(r)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    </div>
  `}).join('');

  // Generate domaines experience HTML
  const domainesExpHtml = domainesExperience.map(domaine => `
    <div class="domaine-item">
      <h4>${esc(domaine.titre || '')}</h4>
      ${Array.isArray(domaine.missions) && domaine.missions.length ? `
        <ul>
          ${domaine.missions.map((mission: string) => `<li>${esc(mission)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  // Generate missions pertinentes HTML
  const missionsHtml = missionsPartinentes.map(mission => `
    <div class="mission-item">
      <h4>${esc(mission.entreprise || '')} – ${esc(mission.fonction || '')}</h4>
      <span class="date">${esc(mission.periode || '')}</span>
      ${mission.lieu ? `<p class="location">${esc(mission.lieu)}</p>` : ''}
      ${Array.isArray(mission.description) && mission.description.length ? `
        <ul>
          ${mission.description.map((desc: string) => `<li>${esc(desc)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  // Generate entreprises formees HTML
  const entreprisesFormeesHtml = entreprisesFormees.map(ent => `
    <div class="entreprise-formee">
      <h4>${esc(ent.entreprise || '')}</h4>
      <span class="date">${esc(ent.annee || '')}</span> | <span class="location">${esc(ent.lieu || '')}</span>
      ${Array.isArray(ent.themes) && ent.themes.length ? `
        <ul>
          ${ent.themes.map((theme: string) => `<li>${esc(theme)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  // Generate formation HTML (now for right side)
  const formationHtml = formation.map(form => `
    <div class="formation-entry">
      <div class="entry-row">
        <div class="entry-title">${esc(form.diplome || form.theme || '')}${form.specialite ? ` — ${esc(form.specialite)}` : ''}</div>
        <div class="entry-date">${esc(form.periode || '')}</div>
      </div>
      <div class="entry-body">
        ${form.etablissement ? `<div class="entry-place">${esc(form.etablissement)}${form.lieu ? ' — ' + esc(form.lieu) : ''}</div>` : ''}
        ${form.mention ? `<div class="entry-mention">${esc(form.mention)}</div>` : ''}
        ${form.details ? `<div class="entry-details">${esc(form.details)}</div>` : ''}
      </div>
    </div>
  `).join('');

  // Generate languages HTML
  const languesHtml = langues.map(lang => {
    const niveau = lang.niveau_general || `${lang.niveau_lu || ''} ${lang.niveau_parle || ''} ${lang.niveau_ecrit || ''}`.trim();
    return `<div class="lang-item"><strong>${esc(lang.langue || '')}</strong>: ${esc(niveau)}</div>`;
  }).join('');

  // Generate IT skills HTML
  const itSkills = [
    ...(informatique?.logiciels || []),
    ...(informatique?.technologies || []),
    ...(informatique?.systemes || []),
    ...(informatique?.applications_metier || [])
  ];

  // Generate references HTML
  const referencesHtml = references.map(ref => `
    <div class="reference">
      <strong>${esc(ref.nom_prenom || '')}</strong><br/>
      ${ref.fonction ? `${esc(ref.fonction)}<br/>` : ''}
      ${ref.entreprise ? `${esc(ref.entreprise)}<br/>` : ''}
      ${ref.telephone ? `${esc(ref.telephone)}<br/>` : ''}
      ${ref.email ? `${esc(ref.email)}` : ''}
    </div>
  `).join('');

  // Render rapport section if present
  const rapportHtml = (rapport && typeof rapport === 'object') ? (() => {
    const resumeTxt = rapport.resume || rapport.summary || rapport.sommaire || '';
    const forces = Array.isArray(rapport.forces) ? rapport.forces : (Array.isArray(rapport.strengths) ? rapport.strengths : []);
    const lacunes = Array.isArray(rapport.lacunes) ? rapport.lacunes : (Array.isArray(rapport.gaps) ? rapport.gaps : []);
    const roles = Array.isArray(rapport.roles_recommandes) ? rapport.roles_recommandes : (Array.isArray(rapport.recommended_roles) ? rapport.recommended_roles : []);
    return `
      <div class="section">
        <h2>Rapport</h2>
        ${resumeTxt ? `<p>${esc(resumeTxt)}</p>` : ''}
        ${forces.length ? `<h4>Forces</h4><ul>${forces.map((f:string)=>`<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${lacunes.length ? `<h4>Lacunes</h4><ul>${lacunes.map((l:string)=>`<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        ${roles.length ? `<h4>Rôles recommandés</h4>
          <ul>
            ${roles.map((r:any)=>`<li><strong>${esc(r.titre || r.title || r.name || '')}</strong>${r.seniorite || r.seniority || r.niveau ? ` — ${esc(r.seniorite || r.seniority || r.niveau || '')}` : ''}${typeof r.score_de_compatibilite === 'number' ? ` <em>(${Number(r.score_de_compatibilite).toFixed(1)})</em>` : ''}${r.pourquoi || r.why ? `<div style="margin-top:6px">${esc(r.pourquoi || r.why)}</div>` : ''}</li>`).join('')}
          </ul>` : ''}
      </div>
    `;
  })() : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(fullName)}</title>
  <style>
    /* ========== BASE STYLES ========== */
    /* Reset and base font settings */
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 0;
      background: #fff; /* Light neutral background */
      color: #575757;
      line-height: 1.6;
    }

    /* ========== HEADER  ========== */
    /* Top header with photo, name, and logo */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 30px 40px;
      background: #ffffff;
      border-bottom: 1px solid #575757; /* Strong bottom border for emphasis */
      max-width: 1100px;
      margin: 20px auto;
    }

    /* Profile photo styling - circular with border */
    .header img.photo {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid #575757;
    }

    /* Center info section - name and title */
    .header .infoPers {
      flex: 1;
      text-align: center;
      padding: 0 20px;
    }

    /* Name styling - large and prominent */
    .infoPers h1 {
      letter-spacing: 6px;
      font-weight: 700;
      font-size: 32px;
      margin: 0;
      color: #575757;
      text-transform: uppercase;
    }

    /* Job title styling */
    .infoPers h3 {
      font-size: 18px;
      font-weight: 400;
      margin-top: 8px;
      color: #575757;
      letter-spacing: 2px;
    }

    /* Motto styling - italic and subtle */
    .infoPers .motto {
      font-style: italic;
      margin-top: 10px;
      color: #575757;
      font-size: 14px;
    }

    /* Company logo styling */
    .header .logo {
      width: 100px;
      height: 100px;
      object-fit: contain;
    }

    /* ========== MAIN CONTAINER ========== */
    /* Two-column layout container */
    .container {
      display: grid;
      grid-template-columns: 30% 70%; /* Left sidebar narrower */
      max-width: 100%;
      margin: 0 auto 20px auto;
      background: #fff;
      min-height: 800px;
      padding: 10px
    }

/* ========== LEFT SIDEBAR ========== */
/* Dark sidebar for contact and key info */
.left {
  position: relative;
  color: black;
  padding-right: 10px;
  margin-right: 10px;
  border-right: 1px solid #575757;
}

/* Rhomboid shape on left border - top */
.left::before {
  content: '';
  position: absolute;
  right: -8px;
  top: 20%;
  width: 14px;
  height: 14px;
  border: 1px solid #575757;
  background: #575757;   /* gray fill */
  transform: rotate(45deg);
  z-index: 1;
}

/* Rhomboid shape on left border - middle */
.left::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  width: 14px;
  height: 14px;
  border: 1px solid #575757;
  background: #575757;   /* gray fill */
  transform: rotate(45deg);
  z-index: 1;
}

    /* Section headers in left sidebar */
    .left h2 {
      font-size: 17px;
      color: #575757;
      border-bottom: 1px dashed #575757;
      padding-bottom: 8px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
      text-align:center;
    }

    .left h2:first-of-type {
      margin-top: 0;
    }

    /* Paragraph text in sidebar */
    .left p, .left .lang-item {
      color:#575757;
      font-size: 13px;
      margin: 8px 0;
      line-height: 1.5;
    }

    /* Unordered lists in sidebar */
    .left ul {
      list-style: none;
      padding: 0;
      margin: 10px 0;
    }

    /* List items in sidebar */
    .left li {
      font-size: 13px;
      color:#575757;
      margin: 6px 0;
      padding-left: 15px;
      position: relative;
      line-height: 1.5;
    }

    /* Bullet points for sidebar lists */
    .left li:before {
      content: "▸";
      position: absolute;
      left: 0;
      color: black;
    }

    /* ========== RIGHT CONTENT AREA ========== */
    /* Main content area with experience and sections */
    .right {
      background: #ffffff;
    }

    /* ========== SECTION STYLING ========== */
    /* Individual content sections */
    .section {
      margin-bottom: 35px;
      padding-bottom: 10px;
    }

    .section:last-child {
      border-bottom: none;
    }

    /* Section headers in right content */
    .section h2 {
      margin-top:0px;
      font-size: 17px;
      color: #575757;
      border-bottom: 1px dashed #575757;
      padding-bottom: 8px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 700;
      text-align:center;
    }

    /* Section paragraph text */
    .section p {
      font-size: 14px;
      margin: 8px 0;
      line-height: 1.6;
      color: #000000ff;
    }

    /* ========== JOB/EXPERIENCE ENTRIES ========== */
    /* Individual job/experience block */
    .job, .mission-item, .entreprise-formee, .domaine-item {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ecf0f1;
    }

    .job:last-child, .mission-item:last-child, 
    .entreprise-formee:last-child, .domaine-item:last-child {
      border-bottom: none;
    }

    /* Job title styling */
    .job h3, .mission-item h4, .entreprise-formee h4, .domaine-item h4 {
      font-size: 15px;
      margin: 0 0 8px 0;
      font-weight: 700;
      color: #575757;
      line-height: 1.4;
    }

    /* Date spans in job entries */
    .job span, .mission-item span {
      font-size: 12px;
      color: #575757;
      font-style: italic;
    }

    /* Location and sector info */
    .location, .sector {
      font-size: 13px;
      color: #95a5a6;
      margin: 4px 0;
      font-style: italic;
    }

    /* Job description lists */
    .job ul, .mission-item ul, .entreprise-formee ul, .domaine-item ul {
      margin: 10px 0;
      padding-left: 20px;
    }

    /* Job description list items */
    .job li, .mission-item li, .entreprise-formee li, .domaine-item li {
      font-size: 13px;
      margin: 6px 0;
      line-height: 1.5;
      color: #555;
    }

    /* Achievements list styling - different color */
    .achievements li {
      color: #27ae60;
      font-weight: 500;
    }

    /* ========== FORMATION SECTION ========== */
  /* Entry row layout: title left, date right, body underneath */
  .entry-row{display:flex;justify-content:space-between;align-items:flex-start}
  .entry-title{font-weight:700;color:#575757;font-size:14px}
  .entry-date{font-size:12px;color:#8f8f8f;font-style:italic}
  .entry-body{margin-top:8px;padding-left:0}
  .entry-place{font-style:italic;color:#666;margin-bottom:6px}
  .entry-list{margin:6px 0 0 18px;padding:0}
  .formation-entry, .work-entry{margin-bottom:12px;padding:12px 0;border-bottom:1px solid #f3f3f3}

    /* Formation item container */
    .formation-item {
      // margin-bottom: 18px;
      // padding: 15px;
      background: #f8f9fa;
    }

    /* Formation header with degree and date */
    .formation-header {
      border:1px solid red;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: px;
    }

    .formation-header strong {
      color: #2c3e50;
      font-size: 14px;
    }

    /* Formation body with school info */
    .formation-body {
      font-size: 13px;
      color: #7f8c8d;
    }

    /* Date styling */
    .date {
      color: #95a5a6;
      font-size: 12px;
      font-style: italic;
    }

    /* ========== REFERENCES SECTION ========== */
    /* Individual reference card */
    .reference {
      margin-bottom: 15px;
      // padding: 15px;
      overflow-wrap: break-word;
      background: #f8f9fa;
      font-size: 13px;
      line-height: 1.6;
    }

    .reference strong {
      color: #2c3e50;
      font-size: 14px;
    }

    /* ========== LISTS AND ARRAYS ========== */
    /* Realizations list */
    .realisations-list {
      list-style-type: none;
      padding: 0;
    }

    .realisations-list li {
      padding: 8px 0 8px 20px;
      position: relative;
      border-bottom: 1px solid #ecf0f1;
    }

    .realisations-list li:before {
      content: "*";
      position: absolute;
      left: 0;
      color: #575757;
      font-weight: bold;
    }

    /* Interests and distinctions inline list */
    .inline-list {
      color: #555;
      font-size: 14px;
    }

    /* ========== PRINT OPTIMIZATION ========== */
    /* Print-friendly styling */
    // @media print {
    //   body {
    //     background: white;
    //   }
      
    //   .container {
    //     box-shadow: none;
    //     border: 1px solid #ddd;
    //   }
      
    //   .header {
    //     border-bottom: 2px solid #2c3e50;
    //   }
      
    //   .section {
    //     page-break-inside: avoid;
    //   }
    // }

  </style>
</head>
<body>

  <!-- Header with photo and logo -->
  <div class="header">
    ${imageUrl ? `<img class="photo" src="${esc(imageUrl)}" alt="Photo">` : '<div style="width: 120px; height: 120px;"></div>'}
    <div class="infoPers">
      <h1>${esc(fullName)}</h1>
      <h3>${esc(pi.profession_title || 'CONSEIL - FORMATION')}</h3>
      ${pi.motto ? `<p class="motto">${esc(pi.motto)}</p>` : ''}
    </div>
    <img class="logo" src="/Mag-Management-logo.png" alt="Logo">
  </div>

  <!-- Main content -->
  <div class="container">
    <!-- Left Column -->
    <div class="left">
      <h2>Contact</h2>
      ${contact.adresse ? `<p>${esc(contact.adresse)}</p>` : ''}
      ${contact.ville && contact.pays ? `<p>${esc(contact.ville)}, ${esc(contact.pays)}</p>` : contact.ville ? `<p>${esc(contact.ville)}</p>` : contact.pays ? `<p>${esc(contact.pays)}</p>` : ''}
      ${contact.telephone || contact.gsm ? `<p>📞 ${esc(contact.telephone || contact.gsm)}</p>` : ''}
      ${contact.email ? `<p>✉ ${esc(contact.email)}</p>` : ''}
      ${contact.linkedin ? `<p>🔗 ${esc(contact.linkedin)}</p>` : ''}
      ${contact.website ? `<p>🌐 ${esc(contact.website)}</p>` : ''}

      ${allSkills.length ? `<h2>Compétences</h2>
      <ul>
        ${allSkills.map(skill => `<li>${esc(skill)}</li>`).join('')}
      </ul>` : ''}

      ${langues.length ? `<h2>Langues</h2>
      ${languesHtml}` : ''}

      ${itSkills.length ? `<h2>Informatique</h2>
      <ul>
        ${itSkills.map(skill => `<li>${esc(skill)}</li>`).join('')}
      </ul>` : ''}

      ${centresInteret.length ? `<h2>Centres d'Intérêt</h2>
      <p class="inline-list">${centresInteret.map(interet => esc(interet)).join(', ')}</p>` : ''}

      ${referencesHtml ? `<h2>Références</h2>
      ${referencesHtml}` : ''}
    </div>

    <!-- Right Column -->
    <div class="right">

      ${summary ? `<div class="section">
        <h2>Profil</h2>
        <p>${esc(summary)}</p>
      </div>` : ''}



      ${formation.length ? `<div class="section">
        <h2>Formation</h2>
        ${formationHtml}
      </div>` : ''}

      ${experience.length ? `<div class="section">
        <h2>Expérience Professionnelle</h2>
        ${experienceHtml}
      </div>` : ''}

      ${domainesExperience.length ? `<div class="section">
        <h2>Domaines d'Expérience</h2>
        ${domainesExpHtml}
      </div>` : ''}

      ${experienceFormation.length ? `<div class="section">
        <h2>Expérience en Formation</h2>
        ${experienceFormation.map(exp => `
          <div class="job">
            <h3>${esc(exp.theme || '')} <span>(${esc(exp.periode || '')})</span></h3>
            ${exp.etablissement ? `<p><em>${esc(exp.etablissement)}</em></p>` : ''}
            ${exp.lieu ? `<p class="location">${esc(exp.lieu)}</p>` : ''}
            ${Array.isArray(exp.description) && exp.description.length ? `
              <ul>
                ${exp.description.map((desc: string) => `<li>${esc(desc)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>` : ''}

      ${missionsPartinentes.length ? `<div class="section">
        <h2>Missions Pertinentes Réalisées</h2>
        ${missionsHtml}
      </div>` : ''}

      ${entreprisesFormees.length ? `<div class="section">
        <h2>Entreprises Formées</h2>
        ${entreprisesFormeesHtml}
      </div>` : ''}

      ${realisations.length ? `<div class="section">
        <h2>Réalisations Principales</h2>
        <ul class="realisations-list">
          ${realisations.map(real => `<li>${esc(real)}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${formationsComplementaires.length ? `<div class="section">
        <h2>Formations Complémentaires</h2>
        <ul class="formations-list">
        ${formationsComplementaires.map(form => `
          <li class="formation-list-item">
            <div class="entry-row">
              <div class="entry-title">${esc(form.theme || form.diplome || '')}</div>
              <div class="entry-date">${esc(form.annee || form.periode || '')}</div>
            </div>
            <div class="formation-body">
              ${form.etablissement ? `<em>${esc(form.etablissement)}</em>` : ''} ${form.lieu ? ` <span class="location">(${esc(form.lieu)})</span>` : ''}
            </div>
          </li>
        `).join('')}
        </ul>
      </div>` : ''}

      ${travauxRecherche.length ? `<div class="section">
        <h2>Travaux de Recherche</h2>
        ${travauxRecherche.map(travail => `
          <div class="formation-item">
            <div class="formation-header">
              <strong>${esc(travail.titre || '')}</strong>
              <span class="date">${esc(travail.annee || '')}</span>
            </div>
            <div class="formation-body">
              ${esc(travail.type || '')} - ${esc(travail.etablissement || '')}
              ${travail.statut ? ` (${esc(travail.statut)})` : ''}
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      ${distinctions.length ? `<div class="section">
        <h2>Distinctions & Prix</h2>
        <ul class="realisations-list">
          ${distinctions.map(dist => `<li>${esc(dist)}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${(activitesParaPro.associations?.length || activitesParaPro.travail_associatif?.length || activitesParaPro.engagements?.length) ? `<div class="section">
        <h2>Activités Para-Professionnelles</h2>
        ${activitesParaPro.associations?.length ? `
          <h4 style="color: #575757; margin-top: 10px;">Associations</h4>
          <ul>${activitesParaPro.associations.map((a: string) => `<li>${esc(a)}</li>`).join('')}</ul>
        ` : ''}
        ${activitesParaPro.travail_associatif?.length ? `
          <h4 style="color: #575757; margin-top: 10px;">Travail Associatif</h4>
          <ul>${activitesParaPro.travail_associatif.map((t: string) => `<li>${esc(t)}</li>`).join('')}</ul>
        ` : ''}
        ${activitesParaPro.engagements?.length ? `
          <h4 style="color: #575757; margin-top: 10px;">Engagements</h4>
          <ul>${activitesParaPro.engagements.map((e: string) => `<li>${esc(e)}</li>`).join('')}</ul>
        ` : ''}
      </div>` : ''}
      ${rapportHtml}
    </div>
  </div>
</body>
</html>`;
}