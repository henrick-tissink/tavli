export default function Home() {
  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <h1 className="text-3xl font-extrabold text-text-primary">Tavli</h1>
      <p className="mt-2 text-text-secondary">Find your table.</p>
      <button className="mt-4 rounded-button bg-brand-primary px-6 py-3 font-bold text-white shadow-card hover:bg-brand-primary-dark hover:shadow-card-hover transition-all">
        Book a Table
      </button>
    </div>
  );
}
