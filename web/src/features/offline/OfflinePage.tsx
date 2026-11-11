import { Link } from 'react-router-dom';
import { CloudOff, Download, Smartphone, Wifi } from 'lucide-react';
import { PageHeader } from '../../components/ui/Misc';
import { Notice } from '../../components/ui/Feedback';
import { useOnline, useDocumentTitle } from '../../hooks/useUtils';

/** Présentation honnête des capacités hors ligne selon la plateforme. */
export default function OfflinePage() {
  useDocumentTitle('Hors ligne');
  const online = useOnline();
  return (
    <div className="page max-w-3xl">
      <PageHeader title="Bibliothèque hors ligne" subtitle="Réviser même sans connexion fiable." />
      <div className="space-y-5">
        <Notice tone={online ? 'success' : 'warning'} title={online ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}>
          {online ? 'Toutes les fonctions sont disponibles.' : 'Les pages déjà ouvertes restent consultables, mais les nouvelles données, l’IA et l’import nécessitent une connexion.'}
        </Notice>
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-serif text-lg font-medium"><Smartphone size={18} className="text-crimson" /> Application Android : hors ligne complet</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px]">
            <li>Dossiers, sous-dossiers, leçons et notes enregistrés sur l’appareil.</li>
            <li>Documents téléchargés pour la lecture hors ligne (option « Wi-Fi uniquement »).</li>
            <li>Révision des cartes mémoire et quiz d’entraînement sans connexion.</li>
            <li>Progrès et modifications synchronisés automatiquement au retour du réseau, avec gestion des conflits.</li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-serif text-lg font-medium"><Wifi size={18} className="text-crimson" /> Version web</h2>
          <p className="mt-2 text-[14.5px]">La version web fonctionne en ligne. Les données récemment consultées restent en mémoire pendant la session et vos réponses de quiz sont conservées sur l’appareil en cas de coupure, puis envoyées dès le retour de la connexion. Le web ne propose pas encore de bibliothèque hors ligne complète.</p>
          <p className="mt-3 flex items-center gap-2 text-sm"><Download size={15} className="text-muted" /> Pour lire un document sans connexion, ouvrez-le puis utilisez « Télécharger ».</p>
        </section>
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-serif text-lg font-medium"><CloudOff size={18} className="text-crimson" /> Fonctions nécessitant Internet</h2>
          <p className="mt-2 text-[14.5px]">Génération de résumés, de cartes et de quiz, tuteur IA, import et analyse de documents (OCR). Aucun modèle d’IA ne fonctionne sur l’appareil.</p>
          <Link to="/settings" className="mt-3 inline-block text-sm text-crimson hover:underline">Préférences de téléchargement</Link>
        </section>
      </div>
    </div>
  );
}
