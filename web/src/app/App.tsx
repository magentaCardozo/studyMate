import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { I18nProvider } from '../lib/i18n';
import { ToastProvider } from '../components/ui/Toast';
import { Loading } from '../components/ui/Feedback';
import { LogoMark } from '../components/ui/Logo';
import { AppLayout } from '../components/navigation/AppLayout';
import { QuickActionsProvider } from '../features/documents/QuickActions';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '../features/auth/AuthPages';
import { ApiError } from '../lib/api';

// Chargement différé des pages : premier affichage plus léger sur réseau mobile.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const CoursesPage = lazy(() => import('../features/courses/CoursesPage'));
const CourseDetailPage = lazy(() => import('../features/courses/CourseDetailPage'));
const FolderPage = lazy(() => import('../features/courses/FolderPage'));
const LessonPage = lazy(() => import('../features/courses/LessonPage'));
const DocumentPage = lazy(() => import('../features/documents/DocumentPage'));
const NoteEditorPage = lazy(() => import('../features/notes/NoteEditorPage'));
const RevisionPage = lazy(() => import('../features/smart-revision/RevisionPage'));
const SummaryPage = lazy(() => import('../features/smart-revision/SummaryPage'));
const DeckPage = lazy(() => import('../features/smart-revision/DeckPage'));
const StudyPage = lazy(() => import('../features/smart-revision/StudyPage'));
const QuizStartPage = lazy(() => import('../features/smart-revision/QuizStartPage'));
const AttemptPage = lazy(() => import('../features/smart-revision/AttemptPage'));
const CoachPage = lazy(() => import('../features/study-coach/CoachPage'));
const ChatPage = lazy(() => import('../features/study-coach/ChatPage'));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'));
const ProgressPage = lazy(() => import('../features/progress/ProgressPage'));
const OfflinePage = lazy(() => import('../features/offline/OfflinePage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const SearchPage = lazy(() => import('../features/search/SearchPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory">
      <LogoMark size={48} className="animate-pulse" />
      <p className="font-serif text-lg text-charcoal">StudyMate AI</p>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <I18nProvider lang={user.preferredLanguage}>{children}</I18nProvider>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

function NotFound() {
  return (
    <div className="page text-center">
      <h1 className="page-title">Page introuvable</h1>
      <p className="mt-2 text-muted">Ce contenu n’existe pas ou ne vous appartient pas.</p>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
              <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                element={
                  <Protected>
                    <QuickActionsProvider>
                      <AppLayout />
                    </QuickActionsProvider>
                  </Protected>
                }
              >
                {[
                  ['/', <DashboardPage />],
                  ['/courses', <CoursesPage />],
                  ['/courses/:id', <CourseDetailPage />],
                  ['/folders/:id', <FolderPage />],
                  ['/lessons/:id', <LessonPage />],
                  ['/documents/:id', <DocumentPage />],
                  ['/inbox', <Navigate to="/courses" replace />],
                  ['/notes/new', <NoteEditorPage />],
                  ['/notes/:id', <NoteEditorPage />],
                  ['/revision', <RevisionPage />],
                  ['/revision/summaries/:id', <SummaryPage />],
                  ['/revision/decks/:id', <DeckPage />],
                  ['/revision/study', <StudyPage />],
                  ['/revision/quizzes/:id', <QuizStartPage />],
                  ['/revision/attempts/:id', <AttemptPage />],
                  ['/coach', <CoachPage />],
                  ['/coach/chat', <ChatPage />],
                  ['/coach/chat/:threadId', <ChatPage />],
                  ['/calendar', <CalendarPage />],
                  ['/progress', <ProgressPage />],
                  ['/offline', <OfflinePage />],
                  ['/settings', <SettingsPage />],
                  ['/notifications', <NotificationsPage />],
                  ['/search', <SearchPage />],
                  ['*', <NotFound />],
                ].map(([path, el]) => (
                  <Route key={path as string} path={path as string} element={<Suspense fallback={<Loading />}>{el}</Suspense>} />
                ))}
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
