import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { organizations } from "@/lib/db/schema";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { OrgTabs } from "./_components/OrgTabs";

export const dynamic = "force-dynamic";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (!(await can(session, "org.read", { kind: "organization", id: orgId }))) {
    redirect("/partner");
  }

  const [org] = await dbAdmin
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) redirect("/partner");

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.org");
  const bundle = buildBundle(locale, ["partner.common", "partner.org"]);

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="min-h-screen bg-surface-bg">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link
            href="/partner"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={15} aria-hidden /> {m.layout.back}
          </Link>
          <header className="mt-4">
            <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{m.layout.eyebrow}</p>
            <h1 className="mt-1.5 font-display text-4xl text-text-primary">{org.name}</h1>
          </header>
          <div className="mt-6">
            <OrgTabs orgId={orgId} />
          </div>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </MessagesProvider>
  );
}
