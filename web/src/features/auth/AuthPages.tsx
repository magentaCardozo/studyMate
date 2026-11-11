import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { Logo } from '../../components/ui/Logo';
import { useDocumentTitle } from '../../hooks/useUtils';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ivory">
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-crimson p-12 text-white lg:flex">
        <Logo size={36} inverted />
        <div>
          <p className="font-serif text-[40px] font-light leading-[1.08] tracking-[-0.025em]">
            Organisez votre savoir.
            <br />
            Comprenez vos cours.
            <br />
            Préparez-vous avec confiance.
          </p>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/80">
            Créez un dossier par cours, alimentez-le avec vos PDF, scans et textes, puis révisez avec des QCM et des fiches générés à partir de vos propres documents — même avec une connexion limitée.
          </p>
        </div>
        <p className="text-[13px] text-white/60">StudyMate AI · Conçu pour les étudiants de l’enseignement supérieur en RDC et en Afrique francophone.</p>
        <svg className="pointer-events-none absolute -right-24 -top-24 opacity-[0.07]" width="420" height="420" viewBox="0 0 64 64" aria-hidden>
          <path d="M14 20c6-2 12-1.5 18 2v26c-6-3.5-12-4-18-2V20z" fill="#fff" />
          <path d="M50 20c-6-2-12-1.5-18 2v26c6-3.5 12-4 18-2V20z" fill="#fff" />
        </svg>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo size={34} />
          </div>
          <h1 className="font-serif text-[28px] font-medium">{title}</h1>
          <p className="mb-7 mt-1 text-muted">{subtitle}</p>
          {children}
          <div className="mt-6 text-sm text-muted">{footer}</div>
        </div>
      </main>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().email('Adresse e-mail invalide'), password: z.string().min(1, 'Mot de passe requis') });

export function LoginPage() {
  useDocumentTitle('Connexion');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  return (
    <AuthLayout title="Connexion" subtitle="Retrouvez votre espace d’apprentissage." footer={<>Pas encore de compte ? <Link className="font-medium text-crimson hover:underline" to="/register">Créer un compte</Link></>}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit(async (v) => {
          setError(null);
          try {
            await login(v.email, v.password);
            navigate(params.get('next') || '/', { replace: true });
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <Input label="Adresse e-mail" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <Input label="Mot de passe" type="password" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-crimson hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Se connecter
        </Button>
      </form>
    </AuthLayout>
  );
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez votre nom'),
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(8, 'Au moins 8 caractères').regex(/[A-Za-z]/, 'Doit contenir une lettre').regex(/[0-9]/, 'Doit contenir un chiffre'),
  preferredLanguage: z.enum(['fr', 'en']),
});

export function RegisterPage() {
  useDocumentTitle('Créer un compte');
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema), defaultValues: { preferredLanguage: 'fr' } });
  return (
    <AuthLayout title="Créer votre compte" subtitle="Gratuit, en moins d’une minute." footer={<>Déjà inscrit ? <Link className="font-medium text-crimson hover:underline" to="/login">Se connecter</Link></>}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit(async (v) => {
          setError(null);
          try {
            await signup(v);
            navigate('/', { replace: true });
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <Input label="Nom complet" autoComplete="name" {...register('name')} error={formState.errors.name?.message} />
        <Input label="Adresse e-mail" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <Input label="Mot de passe" type="password" autoComplete="new-password" hint="8 caractères minimum, avec au moins une lettre et un chiffre." {...register('password')} error={formState.errors.password?.message} />
        <Select label="Langue de l’interface" {...register('preferredLanguage')}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </Select>
        <p className="text-xs text-muted">
          Vos documents restent privés. Ils ne sont transmis à un fournisseur d’IA externe qu’après votre accord explicite, et ne servent pas à entraîner des modèles.
        </p>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Créer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  useDocumentTitle('Mot de passe oublié');
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email('Adresse e-mail invalide') })) });
  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Nous vous enverrons un lien de réinitialisation." footer={<Link className="font-medium text-crimson hover:underline" to="/login">Retour à la connexion</Link>}>
      {sent ? (
        <Notice tone="success" title="Demande envoyée">
          Si un compte existe pour cette adresse, un lien de réinitialisation valable une heure vient d’être envoyé.
        </Notice>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => (await apiRequest('/auth/password-reset/request', { method: 'POST', body: v, noRefresh: true }), setSent(true)))}>
          <Input label="Adresse e-mail" type="email" {...register('email')} error={formState.errors.email?.message} />
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>
            Envoyer le lien
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  useDocumentTitle('Nouveau mot de passe');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password: registerSchema.shape.password })) });
  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sûr." footer={<Link className="font-medium text-crimson hover:underline" to="/login">Retour à la connexion</Link>}>
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            await apiRequest('/auth/password-reset/confirm', { method: 'POST', body: { token: params.get('token'), password: v.password }, noRefresh: true });
            navigate('/login', { replace: true });
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <Input label="Nouveau mot de passe" type="password" autoComplete="new-password" {...register('password')} error={formState.errors.password?.message} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>
          Mettre à jour
        </Button>
      </form>
    </AuthLayout>
  );
}
