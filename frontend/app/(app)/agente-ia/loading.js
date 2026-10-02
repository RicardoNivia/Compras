import PageSkeleton, { ChatSkeleton } from "@/components/PageSkeleton";

export default function LoadingAgenteIA() {
  return (
    <PageSkeleton title="Agente IA">
      <ChatSkeleton />
    </PageSkeleton>
  );
}
