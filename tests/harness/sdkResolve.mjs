// Resolve hook: map the SDK specifier used by backend functions onto the mock.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('npm:@base44/sdk')) {
    return {
      url: new URL('./sdkMock.mjs', import.meta.url).href,
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}