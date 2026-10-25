import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { relativeDay, formatTime } from '../../lib/format';
import type { Notification } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback';
import { PageHeader } from '../../components/ui/Misc';
import { useDocumentTitle } from '../../hooks/useUtils';

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.page<Notification>('/notifications?pageSize=50') });
  const read = useMutation({ mutationFn: (body: object) => api.post('/notifications/read', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <div className="page max-w-3xl">
      <PageHeader title="Notifications" actions={data?.meta.unread ? <Button variant="secondary" icon={<CheckCheck size={16} />} onClick={() => read.mutate({ all: true })}>Tout marquer comme lu</Button> : undefined} />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <Loading /> : !data?.data.length ? (
        <EmptyState icon={<Bell size={22} />} title="Aucune notification" description="Les rappels de sessions, d’examens et les résultats d’analyse de documents apparaîtront ici." />
      ) : (
        <ul className="card divide-y divide-line">
          {data.data.map((n) => {
            const content = (
              <div className="flex gap-3 px-4 py-3">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-crimson'}`} aria-label={n.readAt ? undefined : 'Non lue'} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? '' : 'font-semibold'}`}>{n.title}</p>
                  <p className="text-sm text-charcoal/80">{n.body}</p>
                  <p className="meta mt-0.5">{relativeDay(n.createdAt)} · {formatTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id} onClick={() => !n.readAt && read.mutate({ ids: [n.id] })}>
                {n.link ? <Link to={n.link} className="block hover:bg-ivory/60">{content}</Link> : content}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
