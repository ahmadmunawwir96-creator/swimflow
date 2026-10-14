import { base44 } from '@/api/base44Client';

// Thin wrappers around the academy backend functions. Centralizes function
// invocation and error extraction so pages stay simple. Every privileged write
// still runs through its server-gated backend function — nothing here writes
// protected entities directly from the client.
async function call(name, payload) {
  try {
    const res = await base44.functions.invoke(name, payload);
    return res.data;
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || 'Unexpected error';
    throw new Error(msg);
  }
}

export const academyApi = {
  findUserByEmail: (email) => call('findUserByEmail', { email }),
  assignRole: (target_user_id, role_name) =>
    call('assignAcademyRole', { target_user_id, role_name }),
  revokeRole: (target_user_id, role_name) =>
    call('revokeAcademyRole', { target_user_id, role_name }),
  listRoles: (target_user_id) =>
    call('listAcademyRoles', target_user_id ? { target_user_id } : {}),
  createSelfProfile: (values) => call('createMyStudentProfile', values),
  createDependentProfile: (values) => call('createDependentStudentProfile', values),
  updateMyProfile: (values) => call('updateMyStudentProfile', values),
  registerAccount: (values) => call('registerAccount', values)
};