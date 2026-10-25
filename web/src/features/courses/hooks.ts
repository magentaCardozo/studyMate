import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AcademicYear, Course, CourseDetail, TreeFolder } from '../../types/api';

export const useCourses = (params = '') =>
  useQuery({ queryKey: ['courses', params], queryFn: ({ signal }) => api.page<Course>(`/courses${params}`, signal) });

export const useAllCourses = () => useQuery({ queryKey: ['courses', 'all'], queryFn: () => api.page<Course>('/courses?pageSize=100&sort=alpha').then((r) => r.data), staleTime: 60_000 });

export const useYears = () => useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<AcademicYear[]>('/academic-years'), staleTime: 5 * 60_000 });

export const useCourse = (id: string | undefined) =>
  useQuery({ queryKey: ['course', id], queryFn: () => api.get<CourseDetail>(`/courses/${id}`), enabled: !!id });

export interface FlatFolder {
  id: string;
  name: string;
  depth: number;
  path: string;
}

/** Aplatit l'arborescence (pour les sélecteurs « déplacer vers… »). */
export function flattenFolders(folders: TreeFolder[], depth = 0, prefix = ''): FlatFolder[] {
  return folders.flatMap((f) => {
    const path = prefix ? `${prefix} › ${f.name}` : f.name;
    return [{ id: f.id, name: f.name, depth, path }, ...flattenFolders(f.children, depth + 1, path)];
  });
}

export function allLessons(tree: CourseDetail['tree']) {
  const out: { id: string; title: string; folderPath: string | null }[] = tree.lessons.map((l) => ({ id: l.id, title: l.title, folderPath: null }));
  const walk = (folders: TreeFolder[], prefix: string) => {
    for (const f of folders) {
      const p = prefix ? `${prefix} › ${f.name}` : f.name;
      out.push(...f.lessons.map((l) => ({ id: l.id, title: l.title, folderPath: p })));
      walk(f.children, p);
    }
  };
  walk(tree.folders, '');
  return out;
}

export const COURSE_COLORS = ['#A51C30', '#1F2937', '#287D55', '#B7791F', '#2B5C8A', '#6B4E9B', '#8A5A44', '#4B6B5C'];
