import { listRecords, getMeta } from "@/lib/records";
import PanelCompras from "@/components/PanelCompras";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [records, meta] = await Promise.all([listRecords(), getMeta()]);
  return <PanelCompras initialRecords={records} initialMeta={meta} />;
}
