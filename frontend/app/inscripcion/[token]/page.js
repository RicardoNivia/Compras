import InscripcionPublica from "@/components/bienestar/InscripcionPublica";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inscripción · Bienestar Sinco" };

// Formulario público de inscripción a una actividad de Bienestar: sin sesión (ver middleware.js), con el enlace que
// comparte el equipo de Bienestar.
export default function InscripcionPage({ params }) {
  return <InscripcionPublica token={params.token} />;
}
