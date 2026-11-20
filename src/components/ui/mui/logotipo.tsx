// Marca do FrequenciApp com o mesmo SVG do favicon, no tamanho e na prioridade pedidos.
import Image from "next/image";

export interface LogotipoProps {
  tamanho?: number;
  prioridade?: boolean;
  alt?: string;
}

/** Imagem da marca; o texto alternativo pode ser vazio quando o nome já aparece ao lado. */
export function Logotipo({
  tamanho = 40,
  prioridade = false,
  alt = "FrequenciApp",
}: LogotipoProps) {
  return (
    <Image
      src="/icon.svg"
      alt={alt}
      width={tamanho}
      height={tamanho}
      priority={prioridade}
      unoptimized
      style={{ display: "block", width: tamanho, height: tamanho, flexShrink: 0 }}
    />
  );
}
