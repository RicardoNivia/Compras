import PageSkeleton, { TableSkeleton } from "@/components/PageSkeleton";

export default function LoadingAuditoria() {
  return (
    <PageSkeleton title="Auditoría">
      <TableSkeleton rows={10} />
    </PageSkeleton>
  );
}
