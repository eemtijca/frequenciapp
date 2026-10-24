// Marca do FrequenciApp: usa o mesmo SVG do favicon para manter a identidade visual.
import Image from "next/image";

interface Props {
  tamanho?: number;
  className?: string;
  priority?: boolean;
}

export function Logotipo({ tamanho = 40, className, priority = false }: Props) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={tamanho}
      height={tamanho}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
