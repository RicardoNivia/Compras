import FormularioPagina from "@/components/bienestar/FormularioPagina";

export const dynamic = "force-dynamic";

export default function FundacionEditarActividadPage({ params }) {
  return <FormularioPagina id={params.id} linea="Fundación" />;
}
