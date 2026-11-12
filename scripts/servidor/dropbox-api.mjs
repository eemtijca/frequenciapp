// Cliente Dropbox nativo com origens fixas, TLS validado e recepção limitada.
import https from "node:https";
import { Transform } from "node:stream";
import { lerPrivado } from "./dropbox-estado.mjs";

const exigir = (ok, motivo) => {
  if (!ok) throw new Error(`Dropbox: ${motivo}.`);
};
const idValido = (id) => typeof id === "string" && /^id:[A-Za-z0-9_-]+$/.test(id);
const revValida = (rev) => typeof rev === "string" && /^[a-f0-9]{9,}$/.test(rev);
const rotas = new Map([
  ["/oauth2/token", "api.dropbox.com"],
  ["/2/users/get_current_account", "api.dropboxapi.com"],
  ["/2/files/get_metadata", "api.dropboxapi.com"],
  ["/2/files/list_folder", "api.dropboxapi.com"],
  ["/2/files/list_folder/continue", "api.dropboxapi.com"],
  ["/2/files/download", "content.dropboxapi.com"],
  ["/2/files/delete_v2", "api.dropboxapi.com"],
]);

function receber(rota, corpo, headers, limite, timeoutMs) {
  exigir(rotas.has(rota) && Number.isSafeInteger(limite) && limite > 0, "pedido inválido");
  exigir(Buffer.byteLength(corpo) <= 1024 * 1024, "pedido excede limite");
  return new Promise((resolve, reject) => {
    let resposta,
      fluxo,
      encerrado = false;
    const falhar = () => {
      if (encerrado) return;
      encerrado = true;
      const erro = new Error("Dropbox: transporte interrompido ou limite excedido.");
      reject(erro);
      fluxo?.destroy(erro);
      resposta?.destroy();
      pedido.destroy();
      clearTimeout(prazo);
    };
    const pedido = https.request(
      {
        protocol: "https:",
        hostname: rotas.get(rota),
        port: 443,
        path: rota,
        method: "POST",
        agent: false,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        maxHeaderSize: 16 * 1024,
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(corpo),
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        resposta = res;
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")
          return falhar();
        const declarado = res.headers["content-length"];
        if (declarado !== undefined && (!/^\d+$/.test(declarado) || Number(declarado) > limite))
          return falhar();
        let total = 0;
        fluxo = new Transform({
          highWaterMark: 64 * 1024,
          transform(chunk, encoding, cb) {
            total += chunk.length;
            if (!Number.isSafeInteger(total) || total > limite)
              cb(new Error("Dropbox: limite de recepção excedido."));
            else cb(null, chunk);
          },
        });
        fluxo.on("error", falhar);
        res.on("error", falhar);
        res.on("aborted", falhar);
        res.on("end", () => {
          encerrado = true;
          clearTimeout(prazo);
        });
        // Não há redirecionamentos nem reprodução automática de pedidos.
        if (res.statusCode !== 200) {
          res.resume();
          return falhar();
        }
        res.pipe(fluxo);
        resolve({ stream: fluxo, headers: res.headers });
      },
    );
    const prazo = setTimeout(falhar, timeoutMs);
    pedido.setTimeout(timeoutMs, falhar);
    pedido.on("error", falhar);
    pedido.end(corpo);
  });
}
async function jsonLimitado(pedido) {
  const { stream } = await pedido;
  const partes = [];
  for await (const c of stream) partes.push(c);
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new Error("Dropbox: resposta JSON inválida.");
  }
}

export function criarApiDropbox(config) {
  let accessToken,
    validade = 0;
  const timeoutMs = config.timeoutMs;
  async function token() {
    if (accessToken && Date.now() < validade) return accessToken;
    const segredo = JSON.parse(lerPrivado(config.tokenFile, 64 * 1024));
    exigir(
      [segredo.clientId, segredo.clientSecret, segredo.refreshToken].every(
        (s) => typeof s === "string" && s.length > 0 && s.length <= 8192 && !/[\r\n\x00]/.test(s),
      ),
      "credencial inválida",
    );
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: segredo.refreshToken,
      client_id: segredo.clientId,
      client_secret: segredo.clientSecret,
    }).toString();
    const t = await jsonLimitado(
      receber(
        "/oauth2/token",
        body,
        { "Content-Type": "application/x-www-form-urlencoded" },
        64 * 1024,
        timeoutMs,
      ),
    );
    exigir(
      typeof t.access_token === "string" &&
        /^[\x21-\x7e]{1,8192}$/.test(t.access_token) &&
        t.token_type?.toLowerCase() === "bearer" &&
        Number.isSafeInteger(t.expires_in) &&
        t.expires_in > 60,
      "token inválido",
    );
    accessToken = t.access_token;
    validade = Date.now() + Math.min(t.expires_in - 30, 3600) * 1000;
    return accessToken;
  }
  async function headers(namespace = true) {
    return {
      Authorization: `Bearer ${await token()}`,
      ...(namespace
        ? {
            "Dropbox-API-Path-Root": JSON.stringify({
              ".tag": "namespace_id",
              namespace_id: config.namespaceId,
            }),
          }
        : {}),
    };
  }
  async function rpc(rota, dados, namespace = true) {
    return jsonLimitado(
      receber(
        rota,
        JSON.stringify(dados),
        { ...(await headers(namespace)), "Content-Type": "application/json" },
        4 * 1024 * 1024,
        timeoutMs,
      ),
    );
  }
  return {
    async identity() {
      const conta = await rpc("/2/users/get_current_account", null, false);
      exigir(
        conta.account_id === config.accountId &&
          [conta.root_info?.root_namespace_id, conta.root_info?.home_namespace_id].includes(
            config.namespaceId,
          ),
        "conta ou namespace divergente",
      );
      const pasta = await rpc("/2/files/get_metadata", {
        path: config.folderId,
        include_deleted: false,
      });
      exigir(
        pasta[".tag"] === "folder" &&
          pasta.id === config.folderId &&
          pasta.path_lower === config.folderPath &&
          pasta.sharing_info?.read_only !== true,
        "pasta divergente",
      );
      return Object.fromEntries(
        ["accountId", "namespaceId", "folderId", "destino", "alvo", "banco", "schema"].map((k) => [
          k,
          config[k],
        ]),
      );
    },
    async list({ folderId, namespaceId }) {
      exigir(
        folderId === config.folderId && namespaceId === config.namespaceId,
        "escopo divergente",
      );
      const entries = [],
        cursores = new Set();
      let rota = "/2/files/list_folder",
        args = {
          path: folderId,
          recursive: false,
          include_deleted: false,
          include_mounted_folders: false,
          limit: 2000,
        };
      for (let pagina = 0; pagina < 100; pagina++) {
        const p = await rpc(rota, args);
        exigir(
          Array.isArray(p.entries) &&
            typeof p.has_more === "boolean" &&
            typeof p.cursor === "string" &&
            p.cursor.length > 0 &&
            p.cursor.length <= 65536 &&
            entries.length + p.entries.length <= 100000,
          "inventário incompleto",
        );
        for (const x of p.entries) {
          exigir(
            x &&
              ["file", "folder"].includes(x[".tag"]) &&
              idValido(x.id) &&
              typeof x.name === "string" &&
              x.name.length > 0 &&
              !/[\/\\\x00-\x1f\x7f]/.test(x.name) &&
              x.path_lower === `${config.folderPath}/${x.name.toLowerCase()}` &&
              (x[".tag"] !== "file" || revValida(x.rev)),
            "metadado inválido",
          );
          entries.push({
            name: x.name,
            id: x.id,
            rev: x[".tag"] === "file" ? x.rev : "folder",
            type: x[".tag"],
          });
        }
        if (!p.has_more) return { entries, complete: true };
        exigir(!cursores.has(p.cursor), "cursor repetido");
        cursores.add(p.cursor);
        rota = "/2/files/list_folder/continue";
        args = { cursor: p.cursor };
      }
      throw new Error("Dropbox: inventário excede limite de páginas.");
    },
    async *download({ id, rev, namespaceId, limiteBytes = config.limiteBytes }) {
      exigir(
        idValido(id) &&
          revValida(rev) &&
          namespaceId === config.namespaceId &&
          Number.isSafeInteger(limiteBytes) &&
          limiteBytes > 0 &&
          limiteBytes <= config.limiteBytes,
        "download inválido",
      );
      const r = await receber(
        "/2/files/download",
        "",
        { ...(await headers()), "Dropbox-API-Arg": JSON.stringify({ path: id, rev }) },
        limiteBytes,
        timeoutMs,
      );
      try {
        const m = JSON.parse(r.headers["dropbox-api-result"]);
        exigir(
          m[".tag"] === "file" && m.id === id && m.rev === rev,
          "revisão de download divergente",
        );
        for await (const c of r.stream) yield c;
      } finally {
        r.stream.destroy();
      }
    },
    async delete({ id, parent_rev, namespaceId }) {
      exigir(
        idValido(id) && revValida(parent_rev) && namespaceId === config.namespaceId,
        "exclusão inválida",
      );
      const r = await rpc("/2/files/delete_v2", { path: id, parent_rev });
      exigir(
        r.metadata?.[".tag"] === "file" && r.metadata.id === id && r.metadata.rev === parent_rev,
        "confirmação de exclusão divergente",
      );
    },
  };
}
