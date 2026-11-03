import FormularioPagina from "@/components/bienestar/FormularioPagina";

export const dynamic = "force-dynamic";

export default function BienestarEditarActividadPage({ params }) {
  return <FormularioPagina id={params.id} />;
}
