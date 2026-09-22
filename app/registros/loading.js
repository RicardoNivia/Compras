import PageSkeleton, { TableSkeleton } from "@/components/PageSkeleton";

export default function LoadingRegistros() {
  return (
    <PageSkeleton title="Registros">
      <div className="skeleton-bar" style={{ width: "100%", height: 72, borderRadius: 14, marginBottom: 14 }} />
      <TableSkeleton />
    </PageSkeleton>
  );
}
