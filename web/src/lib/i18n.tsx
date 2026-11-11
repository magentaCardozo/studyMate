import { createContext, useContext, type ReactNode } from 'react';

/**
 * Internationalisation : français par défaut, anglais pris en charge pour la
 * navigation et les éléments communs. Ajouter une langue = ajouter un dictionnaire.
 */
const fr = {
  'nav.overview': 'Accueil',
  'nav.courses': 'Mes dossiers',
  'nav.coursesShort': 'Dossiers',
  'nav.revision': 'Révisions',
  'nav.coach': 'Mon coach',
  'nav.calendar': 'Calendrier',
  'nav.progress': 'Progression',
  'nav.offline': 'Hors ligne',
  'nav.settings': 'Paramètres',
  'nav.profile': 'Profil',
  'nav.notifications': 'Notifications',
  'action.search': 'Rechercher un dossier, un document, une note…',
  'action.import': 'Importer un PDF',
  'action.scan': 'Scanner un document',
  'action.paste': 'Coller du texte',
  'action.newCourse': 'Créer un dossier',
  'action.quiz': 'Générer un QCM',
  'action.review': 'Terminer mes QCM',
  'action.plan': 'Planifier mes révisions',
  'action.logout': 'Se déconnecter',
  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.delete': 'Supprimer',
  'common.retry': 'Réessayer',
  'dashboard.hello': 'Bonjour',
  'dashboard.subtitle': "Voici votre espace d'apprentissage pour aujourd'hui.",
  'dashboard.continue': 'Continuer mes révisions',
};

const en: Record<keyof typeof fr, string> = {
  'nav.overview': 'Overview',
  'nav.courses': 'My Folders',
  'nav.coursesShort': 'Folders',
  'nav.revision': 'Smart Revision',
  'nav.coach': 'My Coach',
  'nav.calendar': 'Calendar',
  'nav.progress': 'Progress',
  'nav.offline': 'Offline Library',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',
  'nav.notifications': 'Notifications',
  'action.search': 'Search folders, documents, notes…',
  'action.import': 'Import a PDF',
  'action.scan': 'Scan a document',
  'action.paste': 'Paste text',
  'action.newCourse': 'Create a folder',
  'action.quiz': 'Generate a multiple-choice quiz',
  'action.review': 'Finish my quizzes',
  'action.plan': 'Plan my revision',
  'action.logout': 'Sign out',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.retry': 'Retry',
  'dashboard.hello': 'Hello',
  'dashboard.subtitle': 'Here is your learning space for today.',
  'dashboard.continue': 'Continue revising',
};

export type TKey = keyof typeof fr;
const dictionaries = { fr, en };
const I18nContext = createContext<{ lang: 'fr' | 'en' }>({ lang: 'fr' });

export function I18nProvider({ lang, children }: { lang: 'fr' | 'en'; children: ReactNode }) {
  document.documentElement.lang = lang;
  return <I18nContext.Provider value={{ lang }}>{children}</I18nContext.Provider>;
}

export function useT() {
  const { lang } = useContext(I18nContext);
  return (key: TKey) => dictionaries[lang][key] ?? fr[key];
}
