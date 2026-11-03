import type { Project } from '../engine/types';
import { db } from './db';

export const listProjects = async () => (await db.all<Project>('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
export const saveProject = (p: Project) => db.put('projects', JSON.parse(JSON.stringify(p)));
export const getProject = (id: string) => db.get<Project>('projects', id);
export const deleteProject = (id: string) => db.del('projects', id);
