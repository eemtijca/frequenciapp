// Página pública do BI: apenas a casca visual, sem sessão nem dados escolares no HTML.
import type { Metadata } from "next";
import VistaBi from "@/components/bi/vista-bi";
export const metadata: Metadata = {
  title: "FrequenciBI",
  robots: { index: false, follow: false },
  description: "Análises escolares de leitura, protegidas por chave da Gestão.",
};
export default function PaginaBi() {
  return <VistaBi />;
}
