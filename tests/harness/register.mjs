// Installs the module resolve hook that replaces the Base44 SDK import.
//
// Usage: node --import ./tests/harness/register.mjs --test tests/backend/*.test.mjs
//
// Every backend function imports `npm:@base44/sdk@0.8.52`. Node cannot resolve that
// specifier, and we must never reach a live SDK or network in tests, so the hook
// rewrites any `npm:@base44/sdk...` specifier to the in-memory mock below. The
// handlers themselves are imported unchanged — the code under test is the real code.
import { register } from 'node:module';

register(new URL('./sdkResolve.mjs', import.meta.url));