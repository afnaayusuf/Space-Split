/// <reference types="vite/client" />

/** True in the build published as a claude.ai artifact. */
declare const __ARTIFACT__: boolean;
/** package.json version, stamped into the app and the files it saves. */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

/** The claude.ai viewer's capability bridge; absent everywhere else. Only `use` is promised. */
interface Window {
  claude?: { use(name: string): Promise<unknown> };
}

// the two Node calls the tests use to read a sample PRN from disk
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Uint8Array;
}
