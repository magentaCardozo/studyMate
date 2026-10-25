import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react';
import type { PlacementValue } from '../courses/PlacementPicker';
import { CourseFormDialog } from '../courses/CourseFormDialog';

// Chargés à la demande (pdf-lib pour le scan est volumineux).
const ImportDialog = lazy(() => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })));
const ScanDialog = lazy(() => import('./ScanDialog').then((m) => ({ default: m.ScanDialog })));
const PasteTextDialog = lazy(() => import('./PasteTextDialog').then((m) => ({ default: m.PasteTextDialog })));

interface QuickActionsValue {
  openImport: (placement?: Partial<PlacementValue>) => void;
  openScan: (placement?: Partial<PlacementValue>) => void;
  openPaste: (placement?: Partial<PlacementValue>) => void;
  openNewCourse: () => void;
}

const Ctx = createContext<QuickActionsValue>({ openImport: () => {}, openScan: () => {}, openPaste: () => {}, openNewCourse: () => {} });

/** Actions globales : les trois modes d'ajout à une base de connaissances et la création de dossier. */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{ kind: 'import' | 'scan' | 'paste' | 'course'; placement?: Partial<PlacementValue>; key: number } | null>(null);
  const close = () => setDialog(null);
  return (
    <Ctx.Provider
      value={{
        openImport: (placement) => setDialog({ kind: 'import', placement, key: Date.now() }),
        openScan: (placement) => setDialog({ kind: 'scan', placement, key: Date.now() }),
        openPaste: (placement) => setDialog({ kind: 'paste', placement, key: Date.now() }),
        openNewCourse: () => setDialog({ kind: 'course', key: Date.now() }),
      }}
    >
      {children}
      <Suspense fallback={null}>
        {dialog?.kind === 'import' && <ImportDialog key={dialog.key} open onClose={close} initial={dialog.placement} />}
        {dialog?.kind === 'scan' && <ScanDialog key={dialog.key} open onClose={close} initial={dialog.placement} />}
        {dialog?.kind === 'paste' && <PasteTextDialog key={dialog.key} open onClose={close} initial={dialog.placement} />}
      </Suspense>
      {dialog?.kind === 'course' && <CourseFormDialog key={dialog.key} open onClose={close} />}
    </Ctx.Provider>
  );
}

export const useQuickActions = () => useContext(Ctx);
