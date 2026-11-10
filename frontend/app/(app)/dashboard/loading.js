import PageSkeleton, { KpiRowSkeleton, CardSkeleton } from "@/components/PageSkeleton";

export default function LoadingDashboard() {
  return (
    <PageSkeleton title="Dashboard de compras">
      <div style={{ marginBottom: 14, display: "flex", gap: 10 }}>
        <div className="skeleton-bar" style={{ width: 140, height: 46, borderRadius: 10 }} />
        <div className="skeleton-bar" style={{ width: 200, height: 46, borderRadius: 10 }} />
      </div>
      <KpiRowSkeleton />
      <div className="grid-2" style={{ marginTop: 14 }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </PageSkeleton>
  );
}
