import FormularioPagina from "@/components/bienestar/FormularioPagina";

export const dynamic = "force-dynamic";

export default function BienestarNuevaActividadPage({ searchParams }) {
  return <FormularioPagina fechaInicial={searchParams?.fecha} />;
}
