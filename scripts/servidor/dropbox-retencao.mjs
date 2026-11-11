// Reconcilia conjuntos Dropbox com revisões condicionais e intenção durável.
import { createHash } from "node:crypto";
import { validarRecibo } from "./recibos.mjs";

const hash = (b) => createHash("sha256").update(b).digest("hex");
function exigir(ok, motivo) {
  if (!ok) throw new Error(`Retenção Dropbox suspensa: ${motivo}`);
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mesmoInventario = (a, b) =>
  a.size === b.size &&
  [...a].every(([nome, item]) => {
    const outro = b.get(nome);
    return (
      outro !== undefined &&
      item.id === outro.id &&
      item.rev === outro.rev &&
      item.type === outro.type
    );
  });

// O provedor de autoridade deve assegurar exclusividade cooperativa contínua, e o
// journal deve oferecer persistência durável/atômica e listagem completa para
// a identidade. Dublês não provam isso. Os recibos históricos são preservados;
// a falta de um recibo referenciado pelo diário bloqueia a operação.
export async function executarRetencaoDropbox({
  api,
  authority,
  store,
  identity,
  receipts,
  agora,
  dias = 30,
  minimo = 5,
  minimoAutorizado,
  limiteBytes,
}) {
  exigir(
    identity &&
      [
        identity.accountId,
        identity.namespaceId,
        identity.folderId,
        identity.destino,
        identity.alvo,
        identity.banco,
        identity.schema,
      ].every((x) => typeof x === "string" && x.length > 0),
    "identidade incompleta",
  );
  exigir(
    Number.isSafeInteger(minimo) &&
      minimo >= 0 &&
      (minimo >= 5 || minimoAutorizado === minimo) &&
      Number.isSafeInteger(dias) &&
      dias >= 0 &&
      Number.isFinite(agora) &&
      Number.isSafeInteger(limiteBytes) &&
      limiteBytes > 0,
    "política inválida",
  );
  exigir(Array.isArray(receipts), "catálogo incompleto");
  const alvo = structuredClone(identity);
  async function autorizar() {
    exigir(igual(await api.identity(), alvo), "identidade divergente");
    exigir((await authority.assertExclusive(alvo)) === true, "exclusividade não demonstrada");
  }
  // Validação e unicidade abrangem todo o catálogo, inclusive os inelegíveis.
  // Só recibos do alvo verificados remotamente protegem o mínimo ou autorizam
  // seleção; um diário que os referencie depois de perder elegibilidade falha.
  const catalogo = receipts.map(({ r, bytes }) => {
    exigir(Buffer.isBuffer(bytes) && bytes.length <= 1024 * 1024, "recibo inválido");
    const original = validarRecibo(JSON.parse(bytes.toString("utf8")));
    exigir(igual(r, original), "recibo divergente");
    return { r: original, bytes: Buffer.from(bytes), reciboHash: hash(bytes) };
  });
  exigir(new Set(catalogo.map(({ r }) => r.base)).size === catalogo.length, "catálogo duplicado");
  const registros = catalogo.filter(
    ({ r }) =>
      r.remoto === alvo.destino &&
      r.escopo.alvo === alvo.alvo &&
      r.escopo.banco === alvo.banco &&
      r.escopo.schema === alvo.schema &&
      r.etapas.remotoVerificado,
  );
  registros.sort(
    (a, b) => Date.parse(b.r.em) - Date.parse(a.r.em) || b.r.base.localeCompare(a.r.base),
  );
  const membros = (x) => [
    ...x.r.artefatos,
    { nome: `${x.r.base}.confirmado.json`, sha256: x.reciboHash },
  ];
  const prefixo = `${alvo.accountId}|${alvo.namespaceId}|${alvo.folderId}|`;
  const diarios = await store.list(alvo);
  exigir(diarios?.complete === true && Array.isArray(diarios.entries), "diário incompleto");
  const porBase = new Map();
  for (const { chave, valor: j } of diarios.entries) {
    exigir(typeof chave === "string" && chave.startsWith(prefixo), "diário inválido");
    const base = chave.slice(prefixo.length),
      reg = registros.find((x) => x.r.base === base);
    exigir(reg && !porBase.has(base), "diário sem recibo ou duplicado");
    const nomes = membros(reg).map((a) => a.nome);
    exigir(
      j &&
        j.versao === 1 &&
        igual(j.identity, alvo) &&
        j.reciboHash === reg.reciboHash &&
        Array.isArray(j.itens) &&
        j.itens.length === nomes.length &&
        j.itens.every(
          (x, i) =>
            x.nome === nomes[i] &&
            typeof x.id === "string" &&
            x.id &&
            typeof x.rev === "string" &&
            x.rev,
        ) &&
        Number.isSafeInteger(j.removidos) &&
        j.removidos >= 0 &&
        j.removidos <= nomes.length &&
        (j.pendente === null || (j.pendente === j.removidos && j.removidos < nomes.length)),
      "diário inválido",
    );
    porBase.set(base, j);
  }
  const ativos = registros.filter((reg) => {
    const j = porBase.get(reg.r.base);
    return !j || j.removidos !== j.itens.length;
  });
  const candidatos =
    dias === 0
      ? []
      : ativos.slice(minimo).filter(({ r }) => agora - Date.parse(r.em) > dias * 86400000);
  // Uma única operação por execução, para limitar efeitos e facilitar retomada.
  const candidato = candidatos[candidatos.length - 1];
  const incompletos = [...porBase].filter(([, j]) => j.removidos < j.itens.length);
  exigir(
    incompletos.length === 0 ||
      (incompletos.length === 1 && candidato && incompletos[0][0] === candidato.r.base),
    "intenção anterior não resolvida",
  );
  if (!candidato && porBase.size === 0) return { removidos: [] };
  await autorizar();
  async function inventario() {
    const l = await api.list({ folderId: alvo.folderId, namespaceId: alvo.namespaceId });
    exigir(l?.complete === true && Array.isArray(l.entries), "inventário incompleto");
    const m = new Map(),
      ids = new Set();
    for (const x of l.entries) {
      exigir(
        x &&
          typeof x.name === "string" &&
          x.name &&
          !x.name.includes("/") &&
          typeof x.id === "string" &&
          x.id &&
          typeof x.rev === "string" &&
          x.rev &&
          ["file", "folder"].includes(x.type) &&
          !m.has(x.name) &&
          !ids.has(x.id),
        "inventário ambíguo",
      );
      m.set(x.name, { id: x.id, rev: x.rev, type: x.type });
      ids.add(x.id);
    }
    return m;
  }
  async function verificar(m, a, r) {
    const item = m.get(a.nome);
    exigir(item && item.type === "file", "artefato ausente ou não é arquivo");
    const original = a.nome.endsWith(".sha256")
      ? r.artefatos.find((x) => x.nome === a.nome.slice(0, -7))
      : null;
    const side = original ? Buffer.from(`${original.sha256}  ${original.nome}\n`) : null;
    const limite = side
      ? Math.min(limiteBytes, side.length)
      : a.nome.endsWith(".confirmado.json")
        ? Math.min(limiteBytes, 1024 * 1024)
        : limiteBytes;
    let total = 0;
    const h = createHash("sha256");
    for await (const chunk of api.download({
      id: item.id,
      rev: item.rev,
      namespaceId: alvo.namespaceId,
      limiteBytes: limite,
    })) {
      exigir(Buffer.isBuffer(chunk) || chunk instanceof Uint8Array, "stream inválido");
      total += chunk.byteLength;
      exigir(Number.isSafeInteger(total) && total <= limite, "limite de bytes excedido");
      if (side)
        exigir(
          Buffer.from(chunk).equals(side.subarray(total - chunk.byteLength, total)),
          "sidecar divergente",
        );
      h.update(chunk);
    }
    exigir((!side || total === side.length) && h.digest("hex") === a.sha256, "hash divergente");
  }
  let mapa = await inventario();
  for (const reg of registros) {
    const anterior = porBase.get(reg.r.base);
    if (anterior && anterior.removidos === anterior.itens.length) {
      for (const item of anterior.itens)
        exigir(!mapa.has(item.nome), "artefato removido reapareceu");
    }
  }
  if (!candidato) return { removidos: [] };
  const chave = `${prefixo}${candidato.r.base}`;
  let j = porBase.get(candidato.r.base);
  const nomes = membros(candidato).map((a) => a.nome);
  if (j) {
    // Uma ausência após pedido incerto não comprova a causa da exclusão.
    if (j.pendente !== null && !mapa.has(nomes[j.pendente]))
      throw new Error(
        "Retenção Dropbox suspensa: exclusão incerta exige reconciliação independente",
      );
  }
  for (const reg of ativos) {
    const isCandidate = reg.r.base === candidato.r.base;
    for (const [i, a] of membros(reg).entries()) {
      if (isCandidate && j && i < j.removidos) {
        exigir(!mapa.has(a.nome), "artefato removido reapareceu");
        continue;
      }
      if (isCandidate && j)
        exigir(
          mapa.get(a.nome)?.type === "file" &&
            mapa.get(a.nome)?.id === j.itens[i].id &&
            mapa.get(a.nome)?.rev === j.itens[i].rev,
          "revisão mudou",
        );
      await verificar(mapa, a, reg.r);
    }
  }
  if (!j) {
    j = {
      versao: 1,
      identity: alvo,
      reciboHash: candidato.reciboHash,
      itens: nomes.map((nome) => ({ nome, ...mapa.get(nome) })),
      removidos: 0,
      pendente: null,
    };
    await store.put(chave, j);
  }
  while (j.removidos < nomes.length) {
    await autorizar();
    const atual = await inventario();
    // Nenhuma mudança no inventário, inclusive nos conjuntos protegidos, é aceita.
    exigir(mesmoInventario(mapa, atual), "concorrência detectada");
    const i = j.removidos,
      item = j.itens[i];
    j = { ...j, pendente: i };
    await store.put(chave, j);
    await autorizar();
    await api.delete({ id: item.id, parent_rev: item.rev, namespaceId: alvo.namespaceId });
    const depois = await inventario();
    const esperado = new Map(mapa);
    esperado.delete(item.nome);
    exigir(mesmoInventario(esperado, depois), "resultado de exclusão incerto");
    j = { ...j, removidos: i + 1, pendente: null };
    await store.put(chave, j);
    mapa = depois;
  }
  return { removidos: [candidato.r.base] };
}
