/// <reference types="vite/client" />

/** True in the build published as a claude.ai artifact: shared data comes from the artifact's database, and printing is blocked. */
declare const __ARTIFACT__: boolean;
/** package.json version, stamped into the app and every file it saves. */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

/** The claude.ai viewer's capability bridge; absent everywhere else. Only `use` is promised. */
interface Window {
  claude?: { use(name: string): Promise<unknown> };
}
