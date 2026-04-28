import {
  getDefaultActiveRole,
  normalizeAccountRoleList,
} from "../src/lib/account-roles.js";

export async function ensureUserRole(executor, userId, role, now = new Date()) {
  if (!role) {
    return;
  }

  await executor.query(
    `
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, role) DO NOTHING
    `,
    [userId, role, now],
  );
}

export async function loadUserRoles(executor, userId) {
  const result = await executor.query(
    `
      SELECT role
      FROM user_roles
      WHERE user_id = $1
      ORDER BY role ASC
    `,
    [userId],
  );

  return normalizeAccountRoleList(result.rows.map((row) => row.role));
}

export async function resolveUserRoles(executor, userId, legacyRole, now = new Date()) {
  if (legacyRole) {
    await ensureUserRole(executor, userId, legacyRole, now);
  }

  const availableRoles = await loadUserRoles(executor, userId);
  const activeRole = getDefaultActiveRole(legacyRole, availableRoles);

  return {
    availableRoles,
    defaultActiveRole: activeRole,
  };
}
