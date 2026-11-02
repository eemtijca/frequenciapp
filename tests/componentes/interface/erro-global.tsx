// Monta o componente real em documento isolado, sem forçar falha na aplicação.
import React from "react";
import { createRoot } from "react-dom/client";
import ErroGlobal from "../../../src/app/global-error";

createRoot(document).render(
  <ErroGlobal
    error={new Error("Erro sintético de teste")}
    reset={() => {
      document.documentElement.dataset.reset = "executado";
    }}
  />,
);
