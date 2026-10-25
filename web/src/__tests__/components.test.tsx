import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState } from '../components/ui/Feedback';
import { Breadcrumbs } from '../components/ui/Misc';
import { ApiError, qs } from '../lib/api';
import { formatSize, plural, sourceLabel } from '../lib/format';
import { validateFile } from '../lib/upload';
import { formatAnswer } from '../features/smart-revision/AttemptPage';
import type { Question } from '../types/api';

describe('composants du design system', () => {
  it('la confirmation est obligatoire avant une suppression', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Supprimer la matière ?" message="Action définitive" />);
    expect(screen.getByRole('dialog', { name: 'Supprimer la matière ?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
  });

  it('états vide et erreur accessibles', () => {
    const retry = vi.fn();
    render(
      <>
        <EmptyState title="Votre espace académique est prêt." description="Créez votre première matière." />
        <ErrorState error={new ApiError(500, 'X', 'Serveur indisponible')} onRetry={retry} />
      </>,
    );
    expect(screen.getByText('Votre espace académique est prêt.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Serveur indisponible');
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(retry).toHaveBeenCalled();
  });

  it("fil d'Ariane : dernier élément marqué comme page courante", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Mes cours', to: '/courses' }, { label: 'Analyse', to: '/courses/1' }, { label: 'Leçon 2' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Mes cours' })).toHaveAttribute('href', '/courses');
    expect(screen.getByText('Leçon 2')).toHaveAttribute('aria-current', 'page');
  });
});

describe('utilitaires', () => {
  it('formatage et validation des fichiers', () => {
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2,5 Mo');
    expect(plural(1, 'leçon')).toBe('1 leçon');
    expect(plural(3, 'leçon')).toBe('3 leçons');
    expect(qs({ a: 1, b: undefined, c: '' })).toBe('?a=1');
    expect(sourceLabel({ title: 'cours.pdf', page: 4 })).toBe('cours.pdf, p. 4');
    expect(sourceLabel({ title: 'notes.docx', page: null })).toBe('notes.docx');
    expect(validateFile(new File(['x'], 'virus.exe'))).toMatch(/format non pris en charge/);
    expect(validateFile(new File(['%PDF'], 'cours.pdf'))).toBeNull();
  });

  it('affichage des réponses de quiz', () => {
    const q = { questionType: 'MATCHING', options: { left: ['a', 'b'], right: ['A', 'B'] } } as unknown as Question;
    expect(formatAnswer(q, [1, 0])).toBe('a → B ; b → A');
    expect(formatAnswer({ questionType: 'TRUE_FALSE', options: [] } as unknown as Question, false)).toBe('Faux');
  });
});
