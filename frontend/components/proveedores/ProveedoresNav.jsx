import Link from "next/link";

// Navegación interna del módulo de proveedores (un solo módulo, tres vistas).
export default function ProveedoresNav({ active }) {
  const items = [
    { key: "maestro", href: "/proveedores", label: "Gestión" },
    { key: "indicadores", href: "/proveedores/indicadores", label: "Indicadores" },
    { key: "informe", href: "/proveedores/informe", label: "Informe mensual" },
  ];
  return (
    <nav className="prov-nav" aria-label="Secciones de proveedores">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className={`prov-nav-link ${active === it.key ? "is-active" : ""}`} aria-current={active === it.key ? "page" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
