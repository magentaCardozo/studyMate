import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Préférence d'affichage conservée localement (ex. vue grille / liste). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`studymate:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`studymate:${key}`, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · StudyMate AI` : 'StudyMate AI';
  }, [title]);
}
