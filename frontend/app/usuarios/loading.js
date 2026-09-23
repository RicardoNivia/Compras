import PageSkeleton, { CardGridSkeleton } from "@/components/PageSkeleton";

export default function LoadingUsuarios() {
  return (
    <PageSkeleton title="Usuarios">
      <div className="role-summary-row" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-bar" style={{ height: 62, borderRadius: 12 }} />
        ))}
      </div>
      <CardGridSkeleton count={8} />
    </PageSkeleton>
  );
}
