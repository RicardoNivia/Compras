import FormularioPagina from "@/components/bienestar/FormularioPagina";

export const dynamic = "force-dynamic";

export default function FundacionNuevaActividadPage({ searchParams }) {
  return <FormularioPagina fechaInicial={searchParams?.fecha} linea="Fundación" />;
}
