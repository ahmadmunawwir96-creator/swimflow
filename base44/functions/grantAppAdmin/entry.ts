import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// DISABLED — this endpoint no longer grants the built-in app Admin role.
//
// It used to promote a Student/Parent to User.role === 'admin' whenever the caller
// already held that role. User.role is platform-wide, so that let any app admin
// escalate another member's authority across every branch — and this app has no
// trusted owner-only identity claim to gate it with (and none may be guessed or
// hard-coded here).
//
// Platform administrator access is now managed only by the app owner in Base44
// (App Users > Edit user). This function therefore fails closed: every
// authenticated caller is refused with 403 and no User record is ever written.
// Unauthenticated callers still get 401. It stays deployed only so any old client
// still holding the wrapper gets a clean refusal instead of a 404.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    console.warn('[grantAppAdmin] refused: app Admin promotion is disabled', { caller_id: user.id });
    return Response.json(
      { error: 'App Admin access is managed by the app owner in Base44' },
      { status: 403 }
    );
  } catch (error) {
    // Diagnostics stay in the function logs; the client never sees internals.
    console.error('[grantAppAdmin] unexpected failure', error);
    return Response.json({ error: 'Grant could not be completed' }, { status: 500 });
  }
}