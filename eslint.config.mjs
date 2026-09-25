import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Regras do ESLint. Estritas de propósito: o projeto não silencia
// alertas de TypeScript sem justificativa registrada em ADR.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts de operação são ferramentas de linha de comando: usam
    // console de propósito para informar o operador.
    files: ["scripts/**/*.mjs", "docker/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "sandbox/**",
      "scripts-icone.cjs",
      "tool-results/**",
      ".next/**",
      "out/**",
      "generated/**",
      "next-env.d.ts",
      ".postgres/**",
      ".sandbox-tools/**",
      "analysis/**",
      "download/**",
      "skills/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
