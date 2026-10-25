import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileImage, FileText, FolderInput, Pin, PinOff, Trash2, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { fileKind, formatSize, relativeDay, STATUS_LABEL } from '../../lib/format';
import { openDocument } from '../../lib/upload';
import type { DocumentItem } from '../../types/api';
import { Badge, DemoBadge, Menu } from '../../components/ui/Misc';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

export function useDocumentActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => ['documents', 'course', 'folder', 'lesson', 'document', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    invalidate,
    patch: useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/documents/${id}`, body), onSuccess: invalidate, onError: toast.error }),
    download: async (id: string) => {
      try {
        const url = await openDocument(id, false);
        const a = document.createElement('a');
        a.href = url;
        a.click();
      } catch (e) {
        toast.error(e);
      }
    },
  };
}

export function StatusBadge({ status }: { status: string }) {
  if (status === 'READY') return null;
  return <Badge tone={status === 'FAILED' ? 'danger' : 'warning'}>{STATUS_LABEL[status]}</Badge>;
}

export function DocumentRow({ doc, onMove }: { doc: DocumentItem; onMove: () => void }) {
  const toast = useToast();
  const actions = useDocumentActions();
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(doc.fileName.replace(/\.[^.]+$/, ''));
  const [del, setDel] = useState(false);
  const Icon = doc.mimeType.startsWith('image/') ? FileImage : FileText;
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-ivory/50">
      <Icon size={18} className="shrink-0 text-muted" aria-hidden />
      <Link to={`/documents/${doc.id}`} className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium hover:text-crimson">
          {doc.pinned && <Pin size={12} className="text-crimson" aria-label="Épinglé" />}
          {doc.fileName}
        </p>
        <p className="meta truncate">
          {fileKind(doc.mimeType)} · {formatSize(doc.fileSize)}
          {doc.pageCount ? ` · ${doc.pageCount} p.` : ''} · {relativeDay(doc.createdAt)}
        </p>
      </Link>
      <span className="flex items-center gap-1">
        {doc.isDemo && <DemoBadge />}
        <StatusBadge status={doc.processingStatus} />
      </span>
      <Menu
        label={`Actions pour ${doc.fileName}`}
        items={[
          { label: 'Renommer', icon: <Pencil size={15} />, onClick: () => setRename(true) },
          { label: 'Déplacer', icon: <FolderInput size={15} />, onClick: onMove },
          { label: doc.pinned ? 'Désépingler' : 'Épingler', icon: doc.pinned ? <PinOff size={15} /> : <Pin size={15} />, onClick: () => actions.patch.mutate({ id: doc.id, body: { pinned: !doc.pinned } }) },
          { label: 'Télécharger', icon: <Download size={15} />, onClick: () => actions.download(doc.id) },
          { label: 'Supprimer', icon: <Trash2 size={15} />, danger: true, onClick: () => setDel(true) },
        ]}
      />
      <Dialog
        open={rename}
        onClose={() => setRename(false)}
        title="Renommer le document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRename(false)}>Annuler</Button>
            <Button
              loading={actions.patch.isPending}
              onClick={() => actions.patch.mutate({ id: doc.id, body: { fileName: name } }, { onSuccess: () => (setRename(false), toast.show('Document renommé.')) })}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
      </Dialog>
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title="Supprimer le document ?"
        message={`« ${doc.fileName} » et son texte extrait seront définitivement supprimés.`}
        onConfirm={async () => {
          await api.del(`/documents/${doc.id}`);
          actions.invalidate();
          toast.show('Document supprimé.');
        }}
      />
    </li>
  );
}
