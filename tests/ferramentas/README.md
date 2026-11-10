# Ferramentas dos ensaios locais

Imagem descartável com Terraform, Docker CLI, Compose, curl, python3 e jq para executar os ensaios do Floci sem instalar ferramentas no host.

## Construir

```bash
docker build -t frequenciapp-ferramentas:local tests/ferramentas
```

## Executar os ensaios do Floci

O contêiner precisa da rede do host para alcançar os emuladores publicados em `localhost` e do socket do Docker para inspecionar e criar os contêineres filhos.

```bash
docker run --rm --network host \
  -v "$PWD:/work" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /work \
  --entrypoint bash \
  frequenciapp-ferramentas:local \
  -lc "bash infra/floci/testar.sh aws"
```

Troque `aws` por `azure` ou `gcp` para os demais ensaios. No Docker Desktop para Windows, a rede do host e o socket funcionam; em outros ambientes, ajuste a montagem do socket e a rede.

## Limpeza

Os ensaios usam recursos sintéticos e destroem o Terraform ao final. Se um ensaio for interrompido, use `MANTER=true` apenas para inspeção e remova os recursos depois. Nunca aponte para nuvem real.
