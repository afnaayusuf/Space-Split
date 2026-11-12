/**
 * Saving a file from the page. Inside claude.ai the viewer is asked first
 * (the page cannot download on its own there); everywhere else it is an
 * ordinary browser download.
 */
export type SaveResult = 'saved' | 'declined' | 'unavailable';

interface Downloads {
  save(r: { filename: string; data: Blob | string | ArrayBufferView }): Promise<unknown>;
}

let downloads: Promise<Downloads | null> | null = null;
const getDownloads = () => (downloads ??= (window.claude?.use('downloads') as Promise<Downloads | null> | undefined) ?? Promise.resolve(null));

export async function saveFile(filename: string, data: string | Uint8Array, mime: string): Promise<SaveResult> {
  if (__ARTIFACT__ && window.claude) {
    const d = await getDownloads().catch(() => null);
    if (!d) return 'unavailable';
    try {
      await d.save({ filename, data: typeof data === 'string' ? data : new Blob([data], { type: mime }) });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** Opens the file picker. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const safeName = (s: string, fallback: string) => (s.trim() || fallback).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
