import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Zap, Download } from "lucide-react";
import fr from '@/i18n/fr';

const Index = () => {
  const { user, loading } = useAuth();
  const t = fr;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <nav className="border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            {/* Placeholder Logo (replace later) */}
            <div className="h-10 w-10 bg-[#163967] text-white flex items-center justify-center font-bold text-xs tracking-tight shadow-sm group-hover:scale-105 transition-transform select-none">
              MAG
            </div>
            <span className="font-semibold tracking-tight text-[#163967] hidden sm:inline">MAG Management Groupe</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <a href="#purpose" className="text-muted-foreground hover:text-[#163967] transition-colors">Purpose</a>
            <a href="#principles" className="text-muted-foreground hover:text-[#163967] transition-colors">Principles</a>
            <a href="#flow" className="text-muted-foreground hover:text-[#163967] transition-colors">Flow</a>
            <a href="#access" className="text-muted-foreground hover:text-[#163967] transition-colors">Access</a>
            {user ? (
              <Link to="/dashboard" className="text-[#163967] underline-offset-4 hover:underline">Dashboard</Link>
            ) : (
              <Link to="/auth" className="text-[#163967] underline-offset-4 hover:underline">Sign In</Link>
            )}
          </div>
        </div>
      </nav>

      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Header / Identity */}
          <header className="space-y-4 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#163967]">
              MAG Management Groupe
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">Plateforme IA interne pour l'amélioration structurée des CV et la standardisation professionnelle au sein de l'organisation.</p>
            <p className="text-sm uppercase tracking-wider text-[#163967]/70 font-medium">Système interne • Personnel autorisé uniquement</p>
          </header>

          {/* Purpose & Mission */}
          <div id="purpose" className="grid gap-8 md:grid-cols-3 scroll-mt-24">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-2xl">Purpose</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    MAG Management Groupe améliore les CV des candidats via des workflows IA contrôlés. Le système affine la structure, la clarté, les énoncés d'impact liés au rôle et les réalisations mesurables tout en préservant l'authenticité. Les résultats sont alignés sur les critères d'examen internes et le ton de la marque.
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-[#163967] flex items-center gap-2"><FileText className="h-4 w-4"/> Entrée</h3>
                    <p className="text-sm text-muted-foreground">CV original (PDF / DOCX) et notes facultatives sur le rôle ciblé.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-[#163967] flex items-center gap-2"><Zap className="h-4 w-4"/> Traitement</h3>
                    <p className="text-sm text-muted-foreground">Pipeline d'amélioration IA : parsing → alignement de rôle → enrichissement d'impact → passe de clarté.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-[#163967] flex items-center gap-2"><Download className="h-4 w-4"/> Sortie</h3>
                    <p className="text-sm text-muted-foreground">Versions normalisées et structurées des CV prêtes pour révision et diffusion.</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  All transformations are logged for traceability. Human reviewers retain final editorial control.
                </div>
              </CardContent>
            </Card>
            <Card id="principles" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="text-2xl">Guiding Principles</CardTitle>
                  <div className="text-sm space-y-2 text-muted-foreground">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Précision plutôt que mise en valeur</li>
                      <li>Quantifier quand vérifiable</li>
                      <li>Base de formatage cohérente</li>
                      <li>Clarté des mots-clés alignée sur le rôle</li>
                      <li>Historique des changements transparent</li>
                    </ul>
                  </div>
                </CardHeader>
            </Card>
          </div>

          {/* Process Detail */}
          <Card id="flow" className="scroll-mt-24">
              <CardHeader>
              <CardTitle className="text-2xl">Processus d'amélioration</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                La plateforme applique un pipeline étagé et déterministe. Chaque étape est auditable et peut être annulée si nécessaire.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-6 text-sm">
              <div>
                <h4 className="font-semibold mb-1 text-[#163967]">1. Ingestion</h4>
                <p className="text-muted-foreground">Analyse du fichier, normalisation du texte, détection des sections.</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-[#163967]">2. Alignement de rôle</h4>
                <p className="text-muted-foreground">Mapper l'expérience vers la fonction ciblée et les niveaux de séniorité.</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-[#163967]">3. Enrichissement d'impact</h4>
                <p className="text-muted-foreground">Ajouter des métriques lorsque fournies ou déductibles ; signaler les lacunes pour révision.</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 text-[#163967]">4. Structure & Sortie</h4>
                <p className="text-muted-foreground">Appliquer une mise en page unifiée ; générer des variantes d'exportation.</p>
              </div>
            </CardContent>
          </Card>

          {/* Access / Notice */}
          <Card id="access" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="text-2xl">Accès et conformité</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                L'utilisation de ce système est restreinte. Toutes les activités sont surveillées. Les documents téléchargés doivent exclure les identifiants personnels sensibles au-delà des données professionnelles standard.
              </CardDescription>
            </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
              <p><span className="font-semibold text-[#163967]">Sécurité :</span> Accès basé sur la session avec opérations limitées par rôle. Toute utilisation non autorisée est interdite.</p>
              <p><span className="font-semibold text-[#163967]">Rétention des données :</span> Les CV sources et améliorés sont conservés pour révision qualité ; les demandes de purge sont respectées selon la politique.</p>
              <p><span className="font-semibold text-[#163967]">Traçabilité :</span> Chaque passe d'amélioration est versionnée ; les différences sont consultables par les administrateurs.</p>
              {!user && (
                <p className="pt-4 text-center">
                  <Link to="/auth" className="text-[#163967] font-medium underline underline-offset-4">
                    Sign in to continue
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
