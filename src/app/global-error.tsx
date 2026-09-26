"use client";

// Fallback quando o layout raiz falha. Usa estilos inline para não depender do CSS.
import { useEffect } from "react";
import Link from "next/link";

const COR_PRIMARIA = "#17784d";
const FUNDO_CLARO = "#f9f7f2";
const TINTA_CLARA = "#3d3a34";
const FUNDO_ESCURO = "#1c1b19";
const TINTA_ESCURA = "#eceae6";

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha no layout raiz:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <head>
        <title>Algo saiu do esperado · FrequenciApp</title>
        <style>{`
          body { background: ${FUNDO_CLARO}; color: ${TINTA_CLARA}; }
          .texto { color: #6f6a60; }
          .acao:focus-visible { outline: 2px solid ${COR_PRIMARIA}; outline-offset: 2px; }
          .secundaria { border-color: #3d3a3433; }
          @media (prefers-color-scheme: dark) {
            body { background: ${FUNDO_ESCURO}; color: ${TINTA_ESCURA}; }
            .texto { color: #b6b2a9; }
            .secundaria { border-color: #ffffff2e; color: ${TINTA_ESCURA}; }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            background: `${COR_PRIMARIA}1a`,
            color: COR_PRIMARIA,
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <span
          className="texto"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600 }}
        >
          Erro 500
        </span>
        <h1 style={{ margin: 0, fontSize: 22 }}>Algo saiu do esperado</h1>
        <p className="texto" style={{ margin: 0, maxWidth: 420, fontSize: 14, lineHeight: 1.6 }}>
          Não foi possível carregar a aplicação. Tente novamente em instantes.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <button
            type="button"
            className="acao"
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "10px 18px",
              minHeight: 44,
              borderRadius: 12,
              border: "none",
              background: COR_PRIMARIA,
              color: "#faf9f6",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="acao secundaria"
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 18px",
              minHeight: 44,
              borderRadius: 12,
              border: "1px solid #3d3a3433",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ir para o início
          </Link>
        </div>
      </body>
    </html>
  );
}
