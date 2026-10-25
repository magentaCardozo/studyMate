import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, apiRequest } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { PageHeader } from '../../components/ui/Misc';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useUtils';
import { useYears } from '../courses/hooks';
import { useAiStatus } from '../smart-revision/GenerateDialog';

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 md:p-6">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {description && <p className="meta mb-4 mt-0.5">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Paramètres');
  const { user, refresh, logout } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const years = useYears();
  const ai = useAiStatus();
  const [profile, setProfile] = useState({ name: '', preferredLanguage: 'fr', timezone: '', faculty: '', institutionName: '' });
  const [notif, setNotif] = useState({ sessions: true, exams: true, flashcards: true, documents: true });
  const [quiet, setQuiet] = useState({ start: '22:00', end: '07:00' });
  const [yearDialog, setYearDialog] = useState(false);
  const [yearName, setYearName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!user) return;
    setProfile({ name: user.name, preferredLanguage: user.preferredLanguage, timezone: user.timezone, faculty: user.faculty ?? '', institutionName: user.institution?.name ?? '' });
    setNotif({ sessions: true, exams: true, flashcards: true, documents: true, ...(user.settings.notifications ?? {}) });
    setQuiet(user.settings.quietHours ?? { start: '22:00', end: '07:00' });
  }, [user]);
  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, []);

  const saveProfile = useMutation({ mutationFn: () => api.patch('/users/me', { ...profile, faculty: profile.faculty || null, institutionName: profile.institutionName || null }), onSuccess: () => (refresh(), toast.show('Profil enregistré.')), onError: toast.error });
  const saveNotif = useMutation({ mutationFn: () => api.patch('/users/me/settings', { notifications: notif, quietHours: quiet }), onSuccess: () => (refresh(), toast.show('Préférences enregistrées.')), onError: toast.error });
  const consent = useMutation({ mutationFn: (granted: boolean) => api.post('/users/me/ai-consent', { granted }), onSuccess: () => (refresh(), qc.invalidateQueries({ queryKey: ['ai-status'] }), toast.show('Préférence enregistrée.')), onError: toast.error });
  const addYear = useMutation({ mutationFn: () => api.post('/academic-years', { name: yearName, semesters: ['Semestre 1', 'Semestre 2'] }), onSuccess: () => (qc.invalidateQueries({ queryKey: ['academic-years'] }), setYearDialog(false), setYearName(''), toast.show('Année ajoutée.')), onError: toast.error });
  const demo = useMutation({ mutationFn: (add: boolean) => (add ? api.post('/users/me/demo-content') : api.del('/users/me/demo-content')), onSuccess: (_d, add) => (['courses', 'dashboard', 'documents'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), toast.show(add ? 'Contenu de démonstration ajouté.' : 'Contenu de démonstration supprimé.')), onError: toast.error });

  const exportData = async () => {
    try {
      const res = await fetch('/api/v1/users/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'studymate-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.show("L'export a échoué.", 'error');
    }
  };

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Paramètres" subtitle={user?.email} />
      <div className="space-y-6">
        <Section title="Profil">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nom" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            <Select label="Langue" value={profile.preferredLanguage} onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
            <Input label="Établissement" placeholder="Université de Kinshasa" value={profile.institutionName} onChange={(e) => setProfile({ ...profile, institutionName: e.target.value })} />
            <Input label="Faculté / programme" value={profile.faculty} onChange={(e) => setProfile({ ...profile, faculty: e.target.value })} />
            <Input label="Fuseau horaire" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} hint="Ex. Africa/Kinshasa, Africa/Lubumbashi" />
          </div>
          <Button className="mt-4" loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Enregistrer</Button>
        </Section>

        <Section title="Années académiques et semestres" description="Classement facultatif de vos dossiers par année et semestre.">
          <ul className="space-y-2">
            {years.data?.map((y) => (
              <li key={y.id} className="rounded-md border border-line px-3 py-2 text-sm">
                <span className="font-medium">{y.name}</span>
                <span className="meta"> — {y.semesters.map((s) => `${s.name}${s._count ? ` (${s._count.courses})` : ''}`).join(', ') || 'aucun semestre'}</span>
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setYearDialog(true)}>Ajouter une année</Button>
        </Section>

        <Section title="Notifications" description="Rappels affichés dans l’application. Aucun rappel n’est envoyé pendant les heures calmes.">
          <div className="space-y-3">
            <Checkbox label="Sessions de révision" description="30 minutes avant une session planifiée." checked={notif.sessions} onChange={(e) => setNotif({ ...notif, sessions: e.target.checked })} />
            <Checkbox label="Examens à venir" description="À partir de 3 jours avant, une fois par jour." checked={notif.exams} onChange={(e) => setNotif({ ...notif, exams: e.target.checked })} />
            <Checkbox label="Cartes à réviser" description="Au plus un rappel par jour, à partir de 5 cartes." checked={notif.flashcards} onChange={(e) => setNotif({ ...notif, flashcards: e.target.checked })} />
            <Checkbox label="Documents analysés" checked={notif.documents} onChange={(e) => setNotif({ ...notif, documents: e.target.checked })} />
          </div>
          <div className="mt-4 grid max-w-sm grid-cols-2 gap-3">
            <Input label="Heures calmes : début" type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
            <Input label="Fin" type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
          </div>
          <p className="meta mt-2">Les notifications push sur mobile nécessitent la configuration d’un service d’envoi (non activé sur ce serveur).</p>
          <Button className="mt-4" variant="secondary" loading={saveNotif.isPending} onClick={() => saveNotif.mutate()}>Enregistrer</Button>
        </Section>

        <Section id="privacy" title="Confidentialité et IA" description="Vos documents sont stockés de façon privée et ne sont jamais accessibles par une URL publique.">
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-success" /> Fournisseur d’IA configuré : <strong>{ai.data?.demoMode ? 'aucun (mode démonstration local)' : ai.data?.provider ?? '—'}</strong>{ai.data?.model && !ai.data.demoMode ? ` (${ai.data.model})` : ''}.</p>
            {ai.data?.external ? (
              <>
                <p>Lorsque vous générez un résumé, des cartes, un quiz ou posez une question, le texte des sources sélectionnées est transmis à ce fournisseur pour produire la réponse. Il n’est pas utilisé pour entraîner des modèles par StudyMate AI.</p>
                {user?.aiConsentAt ? (
                  <Notice tone="success">Accord donné le {formatDate(user.aiConsentAt)}. <button type="button" className="ml-1 underline" onClick={() => consent.mutate(false)}>Retirer mon accord</button></Notice>
                ) : (
                  <Button size="sm" loading={consent.isPending} onClick={() => consent.mutate(true)}>J’autorise ce traitement</Button>
                )}
              </>
            ) : (
              <p className="text-muted">En mode démonstration, aucun contenu n’est envoyé à un service externe.</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={exportData}>Exporter mes données</Button>
            <Button variant="secondary" size="sm" icon={<LogOut size={15} />} onClick={async () => { await apiRequest('/auth/logout-all', { method: 'POST' }).catch(() => {}); await logout(); navigate('/login'); }}>Déconnecter tous les appareils</Button>
          </div>
        </Section>

        <Section id="demo" title="Contenu de démonstration" description="Deux dossiers d’exemple avec leur base de connaissances (marqués « Démo ») pour découvrir l’application. Elles ne représentent aucune activité réelle.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={demo.isPending && demo.variables === true} onClick={() => demo.mutate(true)}>Ajouter l’exemple</Button>
            <Button size="sm" variant="ghost" loading={demo.isPending && demo.variables === false} onClick={() => demo.mutate(false)}>Supprimer l’exemple</Button>
          </div>
        </Section>

        <Section title="Supprimer mon compte" description="Suppression définitive de votre compte, de vos documents stockés et de toutes vos données.">
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleting(true)}>Supprimer mon compte</Button>
        </Section>
      </div>

      <Dialog open={yearDialog} onClose={() => setYearDialog(false)} title="Nouvelle année académique" size="sm" footer={<><Button variant="secondary" onClick={() => setYearDialog(false)}>Annuler</Button><Button disabled={!yearName.trim()} loading={addYear.isPending} onClick={() => addYear.mutate()}>Ajouter</Button></>}>
        <Input label="Nom" placeholder="2026-2027" value={yearName} onChange={(e) => setYearName(e.target.value)} hint="Deux semestres seront créés automatiquement." />
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onClose={() => (setDeleting(false), setPassword(''), setDeleteError(''))}
        title="Supprimer définitivement le compte ?"
        confirmLabel="Supprimer mon compte"
        message={
          <div className="space-y-3">
            <p>Cette action est irréversible : dossiers, documents, notes, révisions et historique seront effacés.</p>
            <Input label="Confirmez avec votre mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={deleteError} />
          </div>
        }
        onConfirm={async () => {
          try {
            await api.del('/users/me', { password });
            qc.clear();
            navigate('/login');
            window.location.reload();
          } catch (e) {
            setDeleteError((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}
