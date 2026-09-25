# ADR-011: Lembrar o login no dispositivo

## Estado

Aceita.

## Contexto

A [ADR-002](002-sessoes-opacas.md) fixou a validade de 30 dias para todas as sessões, sem escolha para a pessoa. Em dispositivos compartilhados da escola, essa conveniência não deveria ser obrigatória, e faltava um jeito explícito de manter o acesso no dispositivo pessoal.

## Decisão

- A tela de entrada ganha a opção "Manter conectado neste dispositivo", marcada por padrão para preservar o comportamento anterior.
- Marcada: sessão de 30 dias, cookie persistente com `Expires` e expiração registrada.
- Desmarcada: cookie de sessão (sem `Expires`, some ao fechar o navegador) e validade de 12 horas registrada no servidor.
- O e-mail pode ser lembrado no `localStorage` do dispositivo para preencher a próxima entrada; a senha nunca é guardada pelo aplicativo, e o gerenciador de senhas do navegador continua responsável pelo autofill.
- Requisições sem o campo continuam com 30 dias, preservando os contratos existentes.

## Alternativas descartadas

- Guardar a senha no dispositivo: contraria o princípio de não reter credencial fora do hash e do gerenciador de senhas do navegador.
- Renovação deslizante a cada uso: manteria sessões vivas indefinidamente e dificultaria a retenção declarada na LGPD.

## Consequências

- A ADR-002 permanece válida no mecanismo (token opaco, hash no banco, HMAC no cookie); muda apenas a política de validade, agora explícita para a pessoa.
- Sem a opção, fechar o navegador já encerra o acesso, o que é adequado a dispositivos compartilhados.
