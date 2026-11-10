import FichaPagina from "@/components/bienestar/FichaPagina";

export const dynamic = "force-dynamic";

export default function FundacionFichaPage({ params }) {
  return <FichaPagina id={params.id} linea="Fundación" />;
}
