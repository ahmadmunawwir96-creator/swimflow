import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { asArray } from '../../shared/studentProfile.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  requireId,
  optionalId,
  optionalText,
  getRecordOrNull,
  writeClassAudit,
  loadAdminLocations,
  MAX_NAME_LENGTH,
  MAX_ADDRESS_LENGTH,
  MAX_LOCATION_NOTES_LENGTH
} from '../../shared/classAccess.ts';

// Create or edit a physical venue. Venues are deactivated, never deleted, so a
// retired pool keeps every historical class that was held there.
//
// The branch must be one of the caller's authorized branches — a branch id from
// the browser is only ever used after that check.
//
// Supported input: { branch_id, name, address?, notes?, is_active?, location_id? }
const ALLOWED_PARAMS = ['location_id', 'branch_id', 'name', 'address', 'notes', 'is_active'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    const roles = createRoleCache(base44);
    const gate = await authorizeAcademyAdminWithCache(base44, auth.user, roles);
    if (gate.error) return gate.error;

    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;
    const body = bodyRes.body;

    const unknown = rejectUnknownParams(body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const branchId = requireId(body.branch_id, 'branch_id');
    if (branchId.error) return branchId.error;
    const name = requireId(body.name, 'name');
    if (name.error) return name.error;
    if (name.value.length > MAX_NAME_LENGTH) {
      return jsonError(400, `name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }
    const address = optionalText(body.address, 'address', MAX_ADDRESS_LENGTH);
    if (address.error) return address.error;
    const notes = optionalText(body.notes, 'notes', MAX_LOCATION_NOTES_LENGTH);
    if (notes.error) return notes.error;
    const locationId = optionalId(body.location_id, 'location_id');
    if (locationId.error) return locationId.error;

    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      return jsonError(400, 'is_active must be true or false');
    }
    const isActive = body.is_active !== false;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }
    if (!scope.branchIds.includes(branchId.value)) {
      return jsonError(403, 'That branch is not in your administrator scope');
    }

    let existing = null;
    if (locationId.value) {
      existing = await getRecordOrNull(base44, 'Location', locationId.value);
      if (!existing) return jsonError(404, 'Venue not found');
      if (!existing.branch_id || !scope.branchIds.includes(existing.branch_id)) {
        return jsonError(404, 'Venue not found');
      }
      // Moving a venue between branches would silently detach it from the classes
      // already held there, so it is refused rather than guessed at.
      if (existing.branch_id !== branchId.value) {
        return jsonError(400, 'A venue cannot be moved to another branch. Add a new venue instead.');
      }
    }

    // Same venue name twice in one branch is almost always a slip; refuse it.
    const sameBranch = asArray(
      await base44.asServiceRole.entities.Location.filter(
        { branch_id: branchId.value },
        { limit: 200 }
      )
    );
    const clash = sameBranch.find(
      (venue) =>
        venue.id !== (existing ? existing.id : null) &&
        String(venue.name || '').trim().toLowerCase() === name.value.toLowerCase()
    );
    if (clash) {
      return jsonError(409, 'A venue with this name already exists in this branch.');
    }

    const payload = {
      name: name.value,
      branch_id: branchId.value,
      address: address.value || null,
      notes: notes.value || null,
      is_active: isActive
    };

    let saved;
    if (existing) {
      saved = await base44.asServiceRole.entities.Location.update(existing.id, payload);
    } else {
      saved = await base44.asServiceRole.entities.Location.create(payload);
    }

    const deactivated = existing && existing.is_active !== false && isActive === false;
    const reactivated = existing && existing.is_active === false && isActive === true;
    const action = !existing
      ? 'location_created'
      : deactivated
        ? 'location_deactivated'
        : reactivated
          ? 'location_reactivated'
          : 'location_updated';

    await writeClassAudit(base44, auth.user, {
      action,
      target_type: 'location',
      target_id: saved.id,
      branch_id: branchId.value,
      summary: !existing
        ? `Added venue ${name.value}`
        : deactivated
          ? `Deactivated venue ${name.value}`
          : reactivated
            ? `Reactivated venue ${name.value}`
            : `Updated venue ${name.value}`,
      details: { name: payload.name, address: payload.address, is_active: payload.is_active }
    });

    const locations = await loadAdminLocations(base44, scope);

    return Response.json(
      {
        location: locations.find((venue) => venue.id === saved.id) || null,
        locations,
        branches: (scope.branches || []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code || null
        }))
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('[saveLocation] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('saveLocation');
  }
}