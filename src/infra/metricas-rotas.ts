// Registro estático das rotas da API usado no label de rota das métricas HTTP.
// Arquivo gerado por `pnpm run rotas:gerar`; não edite à mão.

export interface RotaDeMetrica {
  readonly padrao: RegExp;
  readonly rotulo: string;
}

export const ROTAS_DE_METRICA: readonly RotaDeMetrica[] = Object.freeze([
  {
    padrao: /^\/api\/calendario-letivo\/sincronizar\/desbloqueio$/,
    rotulo: "/api/calendario-letivo/sincronizar/desbloqueio",
  },
  {
    padrao: /^\/api\/planilha\/fila\/agenda$/,
    rotulo: "/api/planilha/fila/agenda",
  },
  {
    padrao: /^\/api\/planilha\/fila\/processar$/,
    rotulo: "/api/planilha/fila/processar",
  },
  {
    padrao: /^\/api\/planilha\/google\/acesso$/,
    rotulo: "/api/planilha/google/acesso",
  },
  {
    padrao: /^\/api\/planilha\/google\/iniciar$/,
    rotulo: "/api/planilha/google/iniciar",
  },
  {
    padrao: /^\/api\/planilha\/google\/retorno$/,
    rotulo: "/api/planilha/google/retorno",
  },
  {
    padrao: /^\/api\/planilha\/google\/selecionar$/,
    rotulo: "/api/planilha/google/selecionar",
  },
  {
    padrao: /^\/api\/planilha\/mensal\/indice$/,
    rotulo: "/api/planilha/mensal/indice",
  },
  {
    padrao: /^\/api\/planilha\/mensal\/legado$/,
    rotulo: "/api/planilha/mensal/legado",
  },
  {
    padrao: /^\/api\/planilha\/mensal\/visibilidade$/,
    rotulo: "/api/planilha/mensal/visibilidade",
  },
  {
    padrao: /^\/api\/relatorios\/grade\/retrato$/,
    rotulo: "/api/relatorios/grade/retrato",
  },
  {
    padrao: /^\/api\/alunos\/importacao$/,
    rotulo: "/api/alunos/importacao",
  },
  {
    padrao: /^\/api\/alunos\/restaurar-origens$/,
    rotulo: "/api/alunos/restaurar-origens",
  },
  {
    padrao: /^\/api\/auth\/entrar$/,
    rotulo: "/api/auth/entrar",
  },
  {
    padrao: /^\/api\/auth\/sair$/,
    rotulo: "/api/auth/sair",
  },
  {
    padrao: /^\/api\/auth\/sessao$/,
    rotulo: "/api/auth/sessao",
  },
  {
    padrao: /^\/api\/backup\/exportar$/,
    rotulo: "/api/backup/exportar",
  },
  {
    padrao: /^\/api\/bi\/chaves$/,
    rotulo: "/api/bi/chaves",
  },
  {
    padrao: /^\/api\/calendario-letivo\/sincronizacao$/,
    rotulo: "/api/calendario-letivo/sincronizacao",
  },
  {
    padrao: /^\/api\/calendario-letivo\/sincronizar$/,
    rotulo: "/api/calendario-letivo/sincronizar",
  },
  {
    padrao: /^\/api\/configuracoes\/completo$/,
    rotulo: "/api/configuracoes/completo",
  },
  {
    padrao: /^\/api\/configuracoes\/lote$/,
    rotulo: "/api/configuracoes/lote",
  },
  {
    padrao: /^\/api\/conta\/senha$/,
    rotulo: "/api/conta/senha",
  },
  {
    padrao: /^\/api\/diretor\/estatisticas$/,
    rotulo: "/api/diretor/estatisticas",
  },
  {
    padrao: /^\/api\/docs\/api\.md$/,
    rotulo: "/api/docs/api.md",
  },
  {
    padrao: /^\/api\/docs\/openapi\.json$/,
    rotulo: "/api/docs/openapi.json",
  },
  {
    padrao: /^\/api\/exportacoes\/registro$/,
    rotulo: "/api/exportacoes/registro",
  },
  {
    padrao: /^\/api\/frequencias\/alertas-beneficios$/,
    rotulo: "/api/frequencias/alertas-beneficios",
  },
  {
    padrao: /^\/api\/frequencias\/resumo$/,
    rotulo: "/api/frequencias/resumo",
  },
  {
    padrao: /^\/api\/frequencias\/seduc$/,
    rotulo: "/api/frequencias/seduc",
  },
  {
    padrao: /^\/api\/horarios\/copiar$/,
    rotulo: "/api/horarios/copiar",
  },
  {
    padrao: /^\/api\/indicadores\/agenda$/,
    rotulo: "/api/indicadores/agenda",
  },
  {
    padrao: /^\/api\/indicadores\/atualizar$/,
    rotulo: "/api/indicadores/atualizar",
  },
  {
    padrao: /^\/api\/indicadores\/preparar$/,
    rotulo: "/api/indicadores/preparar",
  },
  {
    padrao: /^\/api\/indicadores\/recuperar$/,
    rotulo: "/api/indicadores/recuperar",
  },
  {
    padrao: /^\/api\/notificacoes\/agenda$/,
    rotulo: "/api/notificacoes/agenda",
  },
  {
    padrao: /^\/api\/notificacoes\/assinatura$/,
    rotulo: "/api/notificacoes/assinatura",
  },
  {
    padrao: /^\/api\/notificacoes\/configuracao$/,
    rotulo: "/api/notificacoes/configuracao",
  },
  {
    padrao: /^\/api\/notificacoes\/preferencias$/,
    rotulo: "/api/notificacoes/preferencias",
  },
  {
    padrao: /^\/api\/notificacoes\/resumo$/,
    rotulo: "/api/notificacoes/resumo",
  },
  {
    padrao: /^\/api\/notificacoes\/teste$/,
    rotulo: "/api/notificacoes/teste",
  },
  {
    padrao: /^\/api\/planilha-entradas\/enviar$/,
    rotulo: "/api/planilha-entradas/enviar",
  },
  {
    padrao: /^\/api\/planilha-entradas\/estado$/,
    rotulo: "/api/planilha-entradas/estado",
  },
  {
    padrao: /^\/api\/planilha-entradas\/organizar$/,
    rotulo: "/api/planilha-entradas/organizar",
  },
  {
    padrao: /^\/api\/planilha-entradas\/preparar$/,
    rotulo: "/api/planilha-entradas/preparar",
  },
  {
    padrao: /^\/api\/planilha-entradas\/simular$/,
    rotulo: "/api/planilha-entradas/simular",
  },
  {
    padrao: /^\/api\/planilha-parcial\/enviar$/,
    rotulo: "/api/planilha-parcial/enviar",
  },
  {
    padrao: /^\/api\/planilha-parcial\/estado$/,
    rotulo: "/api/planilha-parcial/estado",
  },
  {
    padrao: /^\/api\/planilha-parcial\/preparar$/,
    rotulo: "/api/planilha-parcial/preparar",
  },
  {
    padrao: /^\/api\/planilha-parcial\/simular$/,
    rotulo: "/api/planilha-parcial/simular",
  },
  {
    padrao: /^\/api\/planilha-saidas\/aplicar$/,
    rotulo: "/api/planilha-saidas/aplicar",
  },
  {
    padrao: /^\/api\/planilha-saidas\/copias$/,
    rotulo: "/api/planilha-saidas/copias",
  },
  {
    padrao: /^\/api\/planilha-saidas\/criar-aba$/,
    rotulo: "/api/planilha-saidas/criar-aba",
  },
  {
    padrao: /^\/api\/planilha-saidas\/desconectar$/,
    rotulo: "/api/planilha-saidas/desconectar",
  },
  {
    padrao: /^\/api\/planilha-saidas\/estado$/,
    rotulo: "/api/planilha-saidas/estado",
  },
  {
    padrao: /^\/api\/planilha-saidas\/estrutura$/,
    rotulo: "/api/planilha-saidas/estrutura",
  },
  {
    padrao: /^\/api\/planilha-saidas\/limpar-copias$/,
    rotulo: "/api/planilha-saidas/limpar-copias",
  },
  {
    padrao: /^\/api\/planilha-saidas\/mapa$/,
    rotulo: "/api/planilha-saidas/mapa",
  },
  {
    padrao: /^\/api\/planilha-saidas\/modo-completo$/,
    rotulo: "/api/planilha-saidas/modo-completo",
  },
  {
    padrao: /^\/api\/planilha-saidas\/modo-conservador$/,
    rotulo: "/api/planilha-saidas/modo-conservador",
  },
  {
    padrao: /^\/api\/planilha-saidas\/organizar$/,
    rotulo: "/api/planilha-saidas/organizar",
  },
  {
    padrao: /^\/api\/planilha-saidas\/remover-aba$/,
    rotulo: "/api/planilha-saidas/remover-aba",
  },
  {
    padrao: /^\/api\/planilha-saidas\/restaurar$/,
    rotulo: "/api/planilha-saidas/restaurar",
  },
  {
    padrao: /^\/api\/planilha-saidas\/simular$/,
    rotulo: "/api/planilha-saidas/simular",
  },
  {
    padrao: /^\/api\/planilha\/aplicar$/,
    rotulo: "/api/planilha/aplicar",
  },
  {
    padrao: /^\/api\/planilha\/copias$/,
    rotulo: "/api/planilha/copias",
  },
  {
    padrao: /^\/api\/planilha\/criar-aba$/,
    rotulo: "/api/planilha/criar-aba",
  },
  {
    padrao: /^\/api\/planilha\/desconectar$/,
    rotulo: "/api/planilha/desconectar",
  },
  {
    padrao: /^\/api\/planilha\/diagnostico$/,
    rotulo: "/api/planilha/diagnostico",
  },
  {
    padrao: /^\/api\/planilha\/estado$/,
    rotulo: "/api/planilha/estado",
  },
  {
    padrao: /^\/api\/planilha\/estrutura$/,
    rotulo: "/api/planilha/estrutura",
  },
  {
    padrao: /^\/api\/planilha\/fila$/,
    rotulo: "/api/planilha/fila",
  },
  {
    padrao: /^\/api\/planilha\/limpar-copias$/,
    rotulo: "/api/planilha/limpar-copias",
  },
  {
    padrao: /^\/api\/planilha\/mapa$/,
    rotulo: "/api/planilha/mapa",
  },
  {
    padrao: /^\/api\/planilha\/mensal$/,
    rotulo: "/api/planilha/mensal",
  },
  {
    padrao: /^\/api\/planilha\/modo-completo$/,
    rotulo: "/api/planilha/modo-completo",
  },
  {
    padrao: /^\/api\/planilha\/modo-conservador$/,
    rotulo: "/api/planilha/modo-conservador",
  },
  {
    padrao: /^\/api\/planilha\/organizar$/,
    rotulo: "/api/planilha/organizar",
  },
  {
    padrao: /^\/api\/planilha\/remover-aba$/,
    rotulo: "/api/planilha/remover-aba",
  },
  {
    padrao: /^\/api\/planilha\/restaurar$/,
    rotulo: "/api/planilha/restaurar",
  },
  {
    padrao: /^\/api\/planilha\/simular$/,
    rotulo: "/api/planilha/simular",
  },
  {
    padrao: /^\/api\/provas-bimestrais\/encerrar$/,
    rotulo: "/api/provas-bimestrais/encerrar",
  },
  {
    padrao: /^\/api\/relatorios\/movimentacoes$/,
    rotulo: "/api/relatorios/movimentacoes",
  },
  {
    padrao: /^\/api\/turmas\/ordenar$/,
    rotulo: "/api/turmas/ordenar",
  },
  {
    padrao: /^\/api\/alunos$/,
    rotulo: "/api/alunos",
  },
  {
    padrao: /^\/api\/backup$/,
    rotulo: "/api/backup",
  },
  {
    padrao: /^\/api\/beneficios-frequencia$/,
    rotulo: "/api/beneficios-frequencia",
  },
  {
    padrao: /^\/api\/bi$/,
    rotulo: "/api/bi",
  },
  {
    padrao: /^\/api\/calendario-letivo$/,
    rotulo: "/api/calendario-letivo",
  },
  {
    padrao: /^\/api\/configuracoes$/,
    rotulo: "/api/configuracoes",
  },
  {
    padrao: /^\/api\/diretores$/,
    rotulo: "/api/diretores",
  },
  {
    padrao: /^\/api\/docs$/,
    rotulo: "/api/docs",
  },
  {
    padrao: /^\/api\/entradas$/,
    rotulo: "/api/entradas",
  },
  {
    padrao: /^\/api\/frequencias$/,
    rotulo: "/api/frequencias",
  },
  {
    padrao: /^\/api\/frequencias-parciais$/,
    rotulo: "/api/frequencias-parciais",
  },
  {
    padrao: /^\/api\/frequencias-personalizadas$/,
    rotulo: "/api/frequencias-personalizadas",
  },
  {
    padrao: /^\/api\/horarios$/,
    rotulo: "/api/horarios",
  },
  {
    padrao: /^\/api\/indicadores$/,
    rotulo: "/api/indicadores",
  },
  {
    padrao: /^\/api\/justificativas$/,
    rotulo: "/api/justificativas",
  },
  {
    padrao: /^\/api\/liberadores$/,
    rotulo: "/api/liberadores",
  },
  {
    padrao: /^\/api\/metricas$/,
    rotulo: "/api/metricas",
  },
  {
    padrao: /^\/api\/ordem-almoco$/,
    rotulo: "/api/ordem-almoco",
  },
  {
    padrao: /^\/api\/parametros-acesso$/,
    rotulo: "/api/parametros-acesso",
  },
  {
    padrao: /^\/api\/planilha$/,
    rotulo: "/api/planilha",
  },
  {
    padrao: /^\/api\/planilha-parcial$/,
    rotulo: "/api/planilha-parcial",
  },
  {
    padrao: /^\/api\/planilha-saidas$/,
    rotulo: "/api/planilha-saidas",
  },
  {
    padrao: /^\/api\/provas-bimestrais$/,
    rotulo: "/api/provas-bimestrais",
  },
  {
    padrao: /^\/api\/responsaveis$/,
    rotulo: "/api/responsaveis",
  },
  {
    padrao: /^\/api\/saidas$/,
    rotulo: "/api/saidas",
  },
  {
    padrao: /^\/api\/saude$/,
    rotulo: "/api/saude",
  },
  {
    padrao: /^\/api\/series$/,
    rotulo: "/api/series",
  },
  {
    padrao: /^\/api\/turmas$/,
    rotulo: "/api/turmas",
  },
  {
    padrao: /^\/api\/usuarios$/,
    rotulo: "/api/usuarios",
  },
  {
    padrao: /^\/api\/planilha\/fila\/[^\/]+\/descartar$/,
    rotulo: "/api/planilha/fila/:id/descartar",
  },
  {
    padrao: /^\/api\/planilha\/fila\/[^\/]+\/reenfileirar$/,
    rotulo: "/api/planilha/fila/:id/reenfileirar",
  },
  {
    padrao: /^\/api\/planilha\/fila\/[^\/]+\/resolver$/,
    rotulo: "/api/planilha/fila/:id/resolver",
  },
  {
    padrao: /^\/api\/diretores\/[^\/]+\/palavra-chave$/,
    rotulo: "/api/diretores/:id/palavra-chave",
  },
  {
    padrao: /^\/api\/diretores\/[^\/]+\/revogar$/,
    rotulo: "/api/diretores/:id/revogar",
  },
  {
    padrao: /^\/api\/frequencias-parciais\/[^\/]+\/seduc$/,
    rotulo: "/api/frequencias-parciais/:id/seduc",
  },
  {
    padrao: /^\/api\/saidas\/[^\/]+\/seduc$/,
    rotulo: "/api/saidas/:id/seduc",
  },
  {
    padrao: /^\/api\/alunos\/[^\/]+$/,
    rotulo: "/api/alunos/:id",
  },
  {
    padrao: /^\/api\/beneficios-frequencia\/[^\/]+$/,
    rotulo: "/api/beneficios-frequencia/:id",
  },
  {
    padrao: /^\/api\/calendario-letivo\/[^\/]+$/,
    rotulo: "/api/calendario-letivo/:dia",
  },
  {
    padrao: /^\/api\/diretores\/[^\/]+$/,
    rotulo: "/api/diretores/:id",
  },
  {
    padrao: /^\/api\/entradas\/[^\/]+$/,
    rotulo: "/api/entradas/:id",
  },
  {
    padrao: /^\/api\/frequencias-parciais\/[^\/]+$/,
    rotulo: "/api/frequencias-parciais/:id",
  },
  {
    padrao: /^\/api\/horarios\/[^\/]+$/,
    rotulo: "/api/horarios/:id",
  },
  {
    padrao: /^\/api\/justificativas\/[^\/]+$/,
    rotulo: "/api/justificativas/:codigo",
  },
  {
    padrao: /^\/api\/liberadores\/[^\/]+$/,
    rotulo: "/api/liberadores/:codigo",
  },
  {
    padrao: /^\/api\/ordem-almoco\/[^\/]+$/,
    rotulo: "/api/ordem-almoco/:dia",
  },
  {
    padrao: /^\/api\/provas-bimestrais\/[^\/]+$/,
    rotulo: "/api/provas-bimestrais/:id",
  },
  {
    padrao: /^\/api\/saidas\/[^\/]+$/,
    rotulo: "/api/saidas/:id",
  },
  {
    padrao: /^\/api\/series\/[^\/]+$/,
    rotulo: "/api/series/:id",
  },
  {
    padrao: /^\/api\/turmas\/[^\/]+$/,
    rotulo: "/api/turmas/:id",
  },
  {
    padrao: /^\/api\/usuarios\/[^\/]+$/,
    rotulo: "/api/usuarios/:id",
  },
]);
