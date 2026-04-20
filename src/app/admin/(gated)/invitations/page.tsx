export default function AdminInvitationsPage() {
  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Invitations
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Invite restaurants to onboard on Tavli.
        </p>
      </header>
      <div className="bg-surface-white rounded-card border border-border p-10 text-center">
        <p className="font-semibold text-text-primary">Coming in M5</p>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          Invitation creation, resend, revoke, and Resend email delivery are
          wired up in the next milestone.
        </p>
      </div>
    </div>
  );
}
