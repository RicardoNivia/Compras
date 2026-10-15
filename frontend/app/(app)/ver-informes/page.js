import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { PERIODOS } from "@/components/informes/estudioUtils";

export const dynamic = "force-dynamic";

// "Ver informes": los informes solo para consultar que la persona puede ver (los creó, es administradora o le dieron
// acceso). No requiere el permiso de Informes.
export default async function VerInformesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const res = await backendFetch("/api/reports/compartidos");
  const { informes = [] } = res.ok ? await res.json() : {};

  return (
    <AppShell user={user} title="Ver informes" subtitle="Informes compartidos contigo, con los datos al día">
      {informes.length === 0 ? (
        <div className="est-card" style={{ textAlign: "center", padding: 40 }}>
          <h2 style={{ fontFamily: "Nunito, sans-serif" }}>Todavía no tienes informes para ver</h2>
          <p className="est-sub">Cuando alguien te dé acceso a un informe, aparecerá aquí y en el menú.</p>
        </div>
      ) : (
        <div className="est-compartidos">
          {informes.map((i) => (
            <Link key={i.id} href={`/ver-informes/${i.id}`} className="est-compartido">
              <span className="est-pdf-thumb" aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <strong>{i.nombre}</strong>
                {(() => {
                  const p = PERIODOS.find((x) => x.value === i.periodoGeneral);
                  return (
                    <span className="est-chip est-compartido-periodo" title={p ? `Datos: ${p.label}` : "Datos: todo el histórico"}>
                      Datos · {p ? p.corto : "Histórico"}
                    </span>
                  );
                })()}
                <small>{i.periodoLabel}{i.audiencia ? ` · Para ${i.audiencia}` : ""} · {i.secciones} secciones</small>
                {i.creadoPor && <small>Creado por {i.creadoPor}</small>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
