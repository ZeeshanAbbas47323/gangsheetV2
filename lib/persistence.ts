import type { LibraryAsset, Sheet } from "./types";

const STORAGE_KEY = "gangsheet-project-v1";
const VERSION = 1;

export interface ProjectData {
  version: number;
  savedAt: number;
  activeSheetId: string;
  sheets: Sheet[];
  assets: LibraryAsset[];
}

export function serializeProject(data: Omit<ProjectData, "version" | "savedAt">): string {
  const payload: ProjectData = { version: VERSION, savedAt: Date.now(), ...data };
  return JSON.stringify(payload);
}

function isValid(data: unknown): data is ProjectData {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<ProjectData>;
  return Array.isArray(d.sheets) && Array.isArray(d.assets) && d.sheets.length > 0;
}

/** Persist to localStorage. Returns false (and does not throw) on quota errors. */
export function saveToLocal(
  data: Omit<ProjectData, "version" | "savedAt">
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeProject(data));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable
  }
}

export function loadFromLocal(): ProjectData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Download the project as a .gangsheet.json file. */
export function downloadProject(
  data: Omit<ProjectData, "version" | "savedAt">
): void {
  const blob = new Blob([serializeProject(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gangsheet-project-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function parseProjectFile(file: File): Promise<ProjectData> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!isValid(parsed)) {
    throw new Error("This file is not a valid Gangsheet project.");
  }
  return parsed;
}
