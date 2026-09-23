import PageSkeleton, { TableSkeleton } from "@/components/PageSkeleton";

export default function LoadingMaestros() {
  return (
    <PageSkeleton title="Maestros">
      <div className="dash-tabs" style={{ marginBottom: 14, width: "fit-content" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-bar" style={{ width: 90, height: 30, borderRadius: 7 }} />
        ))}
      </div>
      <TableSkeleton rows={6} />
    </PageSkeleton>
  );
}
