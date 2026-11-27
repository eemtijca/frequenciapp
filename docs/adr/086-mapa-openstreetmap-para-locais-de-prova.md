# ADR-086: mapa do OpenStreetMap para os locais de prova

## Estado

Aceita.

## Contexto

O local de uma prova específica (Enem, vestibulares) era só um texto livre. A equipe queria marcar o ponto exato, inclusive pelo GPS do aparelho em campo, e abrir esse ponto depois em um mapa. O aplicativo não tinha mapa, o `Permissions-Policy` bloqueava a geolocalização (`geolocation=()`) e o CSP só admitia imagens do próprio servidor.

## Decisão

- As coordenadas ficam em `provas_especificas.latitude` e `longitude`, em dupla precisão, opcionais e sempre juntas. Uma restrição do banco exige as duas ou nenhuma, dentro da faixa geográfica, com `IS NOT NULL` explícito porque um `CHECK` com resultado nulo é aprovado. A aplicação arredonda em seis casas (cerca de 11 cm) e recusa par incompleto e valor fora da faixa com 400. A edição substitui tudo: omitir as coordenadas as limpa.
- O mapa usa o Leaflet 1.9.4 diretamente, sem `react-leaflet`, e é carregado sob demanda só quando a pessoa abre o diálogo do mapa. O marcador é um SVG embutido (`divIcon`), porque os ícones padrão do Leaflet dependem de caminhos de arquivo que o bundler quebra.
- Os tiles vêm de `https://tile.openstreetmap.org`, com a atribuição "OpenStreetMap contribuidores" visível no mapa, como exige a política de uso de tiles da OpenStreetMap Foundation. O `Referrer-Policy` atual (`strict-origin-when-cross-origin`) já envia o `Referer` com a origem, que o servidor de tiles exige. O service worker ignora requisições de outra origem, então nada é guardado nem baixado antecipadamente, o que a política proíbe.
- O CSP libera só `img-src https://tile.openstreetmap.org`. Nenhuma conexão de dados (`connect-src`) é aberta para o OpenStreetMap.
- O `Permissions-Policy` passa a `geolocation=(self)`: só a própria origem, sem terceiros. Câmera e microfone seguem bloqueados.
- O GPS é lido uma única vez, quando a pessoa toca em Usar minha localização, com alta precisão e sem reaproveitar leitura antiga. Não há rastreamento. A posição vira o marcador e só é gravada se a equipe salvar a prova. O aviso mostra a precisão informada pelo aparelho e recomenda ajustar o marcador quando passa de 100 m.
- Latitude e longitude também podem ser digitadas, com vírgula ou ponto, o que serve a quem não usa o mapa com ponteiro (teclado e leitor de tela) e a quem já tem as coordenadas.
- No detalhe da prova, o ponto aparece com um link para abrir o openstreetmap.org em outra aba, sem carregar tiles na tela.
- Sobre o marcador, um selo numérico mostra quantos alunos fazem prova naquele lugar. `GET /api/provas/ocupacao` soma os alunos distintos de todas as provas marcadas a até 100 m do ponto, de qualquer data, e um aluno em duas provas do lugar conta uma vez. Com `provaId`, a prova em edição entra na conta com os próprios alunos, mesmo que o ponto novo ainda não esteja salvo. A distância é a de haversine, conferida na aplicação depois de uma caixa de coordenadas no banco, o que dispensa extensão geográfica. A rota devolve só contagens e nomes de provas, nunca dado de aluno. Abaixo do mapa, uma frase e a lista de provas dão o detalhe para quem não enxerga o selo e para conferir a conta; o selo mostra 999+ acima de mil.
- Os testes de ponta a ponta interceptam os tiles e simulam o GPS, para não depender da rede nem sobrecarregar o servidor público.
- A política de privacidade passa a dizer que o servidor de tiles recebe IP, navegador, origem do aplicativo e a área exibida, que pode ser a vizinhança da posição lida.

## Alternativas

- Busca por endereço com o Nominatim: a política do serviço público proíbe autocomplete e limita o uso a uma requisição por segundo para a aplicação inteira, o que exigiria uma camada de controle e mais um terceiro. Ficou fora; a escolha é por toque, GPS ou coordenadas.
- MapLibre GL com tiles vetoriais: o serviço vetorial da fundação tem política própria e a biblioteca pesa mais; o Leaflet com tiles raster basta para marcar um ponto.
- `react-leaflet`: acrescenta uma camada de componentes e o aviso conhecido de contêiner já inicializado no modo estrito do React; o Leaflet direto em um efeito é pequeno e previsível.
- Servidor de tiles próprio ou provedor comercial: custo e operação sem necessidade no volume de uso desta escola. Se o uso crescer, a troca é uma constante e o host do CSP.
- Incorporar o mapa por `iframe` do openstreetmap.org: exigiria liberar `frame-src` e não devolve a coordenada ao aplicativo.

- Contar só os alunos da própria prova: um lugar com várias provas (Enem e simulado no mesmo prédio) mostraria números parciais, e o selo perderia o sentido de ocupação.
- Contar só as provas da mesma data: esconderia que o mesmo prédio recebe turmas em dias diferentes. A lista abaixo do mapa traz a data de cada prova para a pessoa julgar.
- Uma tabela de locais com identificador próprio: resolveria vários locais por prova e o agrupamento exato, mas exige migração e cadastro de lugares; o raio de 100 m cobre o uso atual sem isso.

## Consequências

- Uma dependência de execução nova (`leaflet`, licença BSD-2) e uma de tipos, no pacote carregado só ao abrir o mapa.
- O raio de 100 m é uma constante do domínio. Dois prédios mais próximos que isso contam como um só lugar, e a leitura do GPS (dezenas de metros) cabe dentro dele.
- O uso dos tiles públicos depende da boa fé de uso da fundação, que pode bloquear quem exagera. O volume esperado, um mapa aberto por prova cadastrada, é pequeno.
- O mapa abre sem tiles se o OpenStreetMap estiver fora do ar ou bloqueado na rede da escola; as coordenadas continuam editáveis pelos campos.
- A geolocalização só funciona em HTTPS ou em localhost; em outro caso o aviso explica o motivo.
- As coordenadas descrevem o local da prova, não a posição de quem usa o aplicativo, e acompanham a prova na exclusão. Não entram na cópia JSON.
- A migração é aditiva e não reescreve dados existentes.
