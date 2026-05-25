import Link from "next/link";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  staffInvitations,
  organizations,
  restaurants,
} from "@/lib/db/schema";
import { hashInvitationToken } from "@/lib/invitations";
import { getCurrentSession } from "@/lib/auth/session";
import { AcceptStaffForm } from "./AcceptStaffForm";

export const dynamic = "force-dynamic";

type Loaded =
  | { kind: "config_missing" }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "claimed" }
  | { kind: "revoked" }
  | {
      kind: "valid";
      inv: { email: string; type: "org" | "restaurant"; role: string; scopeName: string | null };
    };

async function load(token: string): Promise<Loaded> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { kind: "config_missing" };
  }
  const [inv] = await dbAdmin
    .select()
    .from(staffInvitations)
    .where(eq(staffInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);

  if (!inv) return { kind: "not_found" };
  if (inv.status === "claimed") return { kind: "claimed" };
  if (inv.status === "revoked") return { kind: "revoked" };
  if (inv.status === "expired" || inv.expiresAt < new Date()) return { kind: "expired" };

  let scopeName: string | null = null;
  if (inv.kind === "org" && inv.organizationId) {
    const [o] = await dbAdmin
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, inv.organizationId))
      .limit(1);
    scopeName = o?.name ?? null;
  } else if (inv.kind === "restaurant" && inv.restaurantId) {
    const [r] = await dbAdmin
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, inv.restaurantId))
      .limit(1);
    scopeName = r?.name ?? null;
  }

  return {
    kind: "valid",
    inv: { email: inv.email, type: inv.kind, role: inv.role, scopeName },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <p className="font-display text-2xl font-bold text-brand-primary tracking-tight">Tavli</p>
        {children}
      </div>
    </div>
  );
}

const ROLE_RO: Record<string, string> = {
  owner: "proprietar",
  admin: "administrator",
  manager: "manager",
  host: "gazdă",
};

export default async function AcceptStaffInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await load(token);

  if (result.kind !== "valid") {
    const messages: Record<string, { h: string; p: string }> = {
      config_missing: { h: "Indisponibil temporar", p: "Sistemul de invitații nu este configurat. Încearcă mai târziu." },
      not_found: { h: "Invitație negăsită", p: "Acest link de invitație nu este valid." },
      expired: { h: "Invitație expirată", p: "Linkul a expirat. Roagă persoana care te-a invitat să trimită o invitație nouă." },
      claimed: { h: "Invitație deja folosită", p: "Această invitație a fost deja acceptată." },
      revoked: { h: "Invitație anulată", p: "Această invitație a fost anulată." },
    };
    const m = messages[result.kind];
    return (
      <Shell>
        <h1 className="mt-4 font-display text-2xl text-text-primary">{m.h}</h1>
        <p className="mt-2 text-sm text-text-secondary">{m.p}</p>
        <Link href="/partner" className="mt-6 inline-block text-sm font-semibold text-brand-primary hover:underline">
          Mergi la panoul partener
        </Link>
      </Shell>
    );
  }

  const { inv } = result;
  const session = await getCurrentSession();
  const scopeLabel = inv.type === "org" ? "organizația" : "restaurantul";
  const roleLabel = ROLE_RO[inv.role] ?? inv.role;

  return (
    <Shell>
      <h1 className="mt-4 font-display text-2xl text-text-primary">Ai fost invitat</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Ai fost invitat să te alături {scopeLabel}
        {inv.scopeName ? (
          <>
            {" "}
            <strong className="text-text-primary">{inv.scopeName}</strong>
          </>
        ) : null}{" "}
        ca <strong className="text-text-primary">{roleLabel}</strong>.
      </p>

      {!session ? (
        <div className="mt-6 rounded-lg bg-surface-bg border border-border p-4">
          <p className="text-sm text-text-secondary">
            Conectează-te cu adresa <strong className="text-text-primary">{inv.email}</strong> pentru a accepta această
            invitație, apoi revino la acest link.
          </p>
          <Link
            href="/partner/sign-in"
            className="mt-3 inline-block text-sm font-semibold text-brand-primary hover:underline"
          >
            Conectează-te
          </Link>
        </div>
      ) : (session.userEmail ?? session.profile.email ?? "").toLowerCase() !== inv.email.toLowerCase() ? (
        <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          Ești conectat ca <strong>{session.userEmail ?? session.profile.email}</strong>, dar invitația este pentru{" "}
          <strong>{inv.email}</strong>. Conectează-te cu adresa corectă pentru a accepta.
        </p>
      ) : (
        <AcceptStaffForm token={token} />
      )}
    </Shell>
  );
}
