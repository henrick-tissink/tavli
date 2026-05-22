/**
 * currentActor — resolves the audit-row identity from session context.
 *
 * Returns { actorUserId, impersonatorUserId } so recordAudit callsites can
 * stamp both the user whose authority drove the action AND the admin
 * (if any) who was acting-as via impersonation.
 *
 * DI seam: takes readImpersonationReturnCookie so tests inject mocks.
 */

import "server-only";
import {
  readImpersonationReturnCookie,
  type ImpersonationReturnPayload,
} from "./impersonation-cookie";

interface Deps {
  readImpersonationReturnCookie: () => Promise<ImpersonationReturnPayload | null>;
}

export interface ActorResolution {
  actorUserId: string;
  impersonatorUserId: string | null;
}

export function makeCurrentActor(deps: Deps) {
  return async function currentActor(actorUserId: string): Promise<ActorResolution> {
    const cookie = await deps.readImpersonationReturnCookie();
    if (!cookie) return { actorUserId, impersonatorUserId: null };
    return { actorUserId, impersonatorUserId: cookie.adminUserId };
  };
}

export const currentActor = makeCurrentActor({ readImpersonationReturnCookie });
