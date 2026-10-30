// Minimal type surface for the SDK specifier backend functions import.
// It is used only by `tsconfig.backend.json` (check:backend). The real client is
// typed by the platform at deploy time; here it must resolve so TypeScript can
// check every other import and expression in base44/** without a false failure.
declare module 'npm:@base44/sdk@0.8.52' {
  export function createClientFromRequest(req: any): any;
}

declare module 'npm:@base44/sdk' {
  export function createClientFromRequest(req: any): any;
}