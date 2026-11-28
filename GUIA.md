# Soundbite: guia de configuração

A Soundbite é uma app web para ouvir e organizar as gravações dos ensaios. Nesta fase é só para ti: abres no telemóvel (iPhone ou Android), entras com a tua conta Google e podes "instalá-la" no ecrã principal, sem passar pelas lojas de apps.

## Como funciona

- **As gravações ficam no teu Google Drive**, numa pasta privada chamada *Soundbite – Ensaios* que a própria app cria. Ninguém mais a vê até criares um link de partilha (ver *Partilhar com a banda e com amigos*).
- **Cada ensaio é uma subpasta com a data**, por exemplo `2026-11-20 · Ensaio`. A app mostra os ensaios por mês, do mais recente para o mais antigo.
- **Entras com a tua conta Google.** A app só tem acesso à pasta que ela criou e ao que lá carregaste pela app, não ao resto do teu Drive.
- **Para ouvir, a app descarrega a gravação para o telemóvel** (com o teu login) e depois toca. Num ficheiro comprimido de 1 hora são cerca de 30 MB. As últimas 4 gravações ficam guardadas enquanto a app estiver aberta.
- **A compressão é feita no teu telemóvel** antes de enviar, por isso nada passa por outros servidores. Há quatro perfis:

| Perfil | Formato | Tamanho aproximado por hora | Para quê |
|---|---|---|---|
| Ensaio leve | MP3 mono 64 kbps | ~29 MB | Gravações de telemóvel |
| Equilibrado | MP3 estéreo 128 kbps | ~58 MB | Quase tudo |
| Estúdio | MP3 estéreo 256 kbps | ~115 MB | Gravações de estúdio |
| Original | Sem alterações | igual ao ficheiro | Quando queres o ficheiro intacto |

Se um ficheiro já for mais pequeno do que o perfil escolhido, a app envia o original.

## Como a data do ensaio é escolhida

Ao carregar, a app sugere uma data e tu podes mudá-la:
1. Se o nome do ficheiro tiver uma data (por exemplo `Recording_20261120_193012.m4a` ou `ensaio 20-11-2026.wav`), usa essa.
2. Senão, usa a data do próprio ficheiro (normalmente o dia em que foi gravado).

## Passos para pôr a app a funcionar (cerca de 20 minutos, uma vez só)

### 1. Alojamento (já feito)

A app está publicada no GitHub Pages em <https://silvinohenriques.github.io/Soundbite/>, a partir do repositório <https://github.com/silvinohenriques/soundbite>. Cada atualização do código no ramo `main` fica online em um ou dois minutos.

### 2. Criar o login Google na Google Cloud

1. Vai a <https://console.cloud.google.com/> com a tua conta Google e cria um projeto novo (por exemplo "Soundbite").
2. Em **APIs e serviços > Biblioteca**, procura **Google Drive API** e carrega em **Ativar**.
3. Em **APIs e serviços > Ecrã de consentimento OAuth** (ou "Google Auth Platform"):
   - Tipo de utilizador: **Externo**.
   - Nome da app: Soundbite. Email de suporte: o teu.
   - Em **Utilizadores de teste** adiciona o teu próprio email.
   - Deixa a app em modo **Teste**. Como só tu a usas, não é preciso pedir verificação à Google. Ao entrar vais ver um aviso "a Google não verificou esta app": carrega em **Continuar**.
4. Em **APIs e serviços > Credenciais > Criar credenciais > ID de cliente OAuth**:
   - Tipo: **Aplicação Web**.
   - Em **Origens JavaScript autorizadas** põe `https://silvinohenriques.github.io` (sem `/Soundbite` no fim).
   - Copia o **ID de cliente** (termina em `.apps.googleusercontent.com`).

Já não é precisa nenhuma chave de API nem partilhar a pasta.

### 3. Preencher o `config.js`

Abre `config.js` num editor de texto e preenche:

```js
bandName: "Nome da banda",
googleClientId: "o ID de cliente OAuth"
```

Ou, mais simples, envia o ID de cliente ao Claude, que o põe na app e publica.

### 4. Primeira utilização

1. Abre https://silvinohenriques.github.io/Soundbite/ no telemóvel e carrega em **Entrar com Google**.
2. Carrega em **Criar a pasta**.
3. Carrega em **Carregar** para enviar as primeiras gravações.

Para a ter no ecrã principal:
- **iPhone:** no Safari, botão Partilhar > **Adicionar ao ecrã principal**.
- **Android:** no Chrome, menu ⋮ > **Instalar app** (ou "Adicionar ao ecrã principal").

## Dicas para carregar gravações

- **Memos de voz do iPhone:** na app Memos de voz, toca na gravação > Partilhar > **Guardar em Ficheiros**. Depois, na Soundbite, escolhe o ficheiro a partir de Ficheiros.
- **Gravações muito longas** (mais de 1h30): a compressão precisa de bastante memória e no telemóvel pode falhar. Se acontecer, faz esse envio no computador (abrindo a app no browser) ou escolhe "Original".
- Deixa o ecrã ligado enquanto envia.

## Limitações desta versão de teste

- **A sessão Google dura cerca de 1 hora.** Depois disso a app volta a pedir "Entrar com Google" (é só um toque).
- **Só aparecem as gravações carregadas pela app.** Ficheiros que metas à mão na pasta pelo Google Drive não aparecem, porque a app só tem acesso ao que ela própria criou. Isto protege o resto do teu Drive.
- Renomear ou apagar gravações faz-se no Google Drive, diretamente (botão do Drive em cada gravação).
- Sem rede não há reprodução.

## Partilhar com a banda e com amigos

Há três formas de abrir a app:

| Quem | Como entra | O que pode fazer |
|---|---|---|
| Tu (dono) | Endereço normal, com login Google | Tudo: carregar, mudar nomes, partilhar |
| A banda | Link da banda (`…/Soundbite/?banda=…`), sem login | Ouvir e descarregar todos os ensaios. Não muda nomes, não apaga, não carrega |
| Amigos | Link "ouve isto" (`…/Soundbite/?ouvir=…`), sem login | Ouvir uma só gravação, numa página simples com um botão de play |

**Quem garante as permissões é o próprio Google Drive**: a app partilha a pasta (ou a gravação) como *qualquer pessoa com o link pode ver*. Com esse papel de leitor o Drive recusa qualquer alteração ou upload, mesmo que alguém tente fora da app.

- **Link da banda:** no topo da app, botão com as duas pessoas > **Criar link da banda** > **Enviar link** (abre a partilha do telemóvel, por exemplo para o grupo do WhatsApp). Quem abrir o link fica com a app em modo "só para ouvir"; pode adicioná-la ao ecrã principal como tu.
- **Ouve isto:** em cada gravação, botão de partilhar (a seta para cima) > **Enviar link**. O amigo vê o nome da gravação, da banda e do ensaio e um botão de play (sem link para o Google Drive). Não vê os outros ensaios.
- **Desligar:** no mesmo sítio há **Desligar o link**. Quem tinha o link deixa de conseguir ouvir. Enquanto o link da banda estiver ligado, todas as gravações continuam acessíveis a quem o tiver.
- **Quem tem o link consegue ouvir.** Se o link da banda for parar às mãos erradas, desliga-o. Atenção: voltar a ligá-lo dá o mesmo link de antes.
- Se num telemóvel abriste o link da banda e queres voltar a entrar como dono, abre `…/Soundbite/?dono`.

### Chave da API (uma vez só, cerca de 3 minutos)

Os links da banda e "ouve isto" funcionam sem login, por isso a app precisa de uma chave da API para ler o que está partilhado. Sem a chave, o link "ouve isto" abre o Google Drive em vez da página da app, e o link da banda ainda não funciona.

1. Em <https://console.cloud.google.com/>, no mesmo projeto "Soundbite", vai a **APIs e serviços > Credenciais > Criar credenciais > Chave de API**.
2. Abre a chave criada e em **Restrições da aplicação** escolhe **Sites (referenciadores HTTP)** e adiciona `https://silvinohenriques.github.io/*`.
3. Em **Restrições da API** escolhe **Restringir chave** e marca só **Google Drive API**. Guarda.
4. Envia a chave ao Claude, que a põe em `config.js` (`googleApiKey`) e publica.

Com estas restrições a chave só funciona a partir da app e só para ler o Drive, por isso não faz mal ficar visível no código.

## Ficheiros

- `index.html`, `styles.css`, `app.js`: a app.
- `config.js`: as tuas definições.
- `encoder-worker.js` e `vendor/lame.min.js`: compressão para MP3 (lamejs, licença LGPL, ver `vendor/LAMEJS-LICENSE.txt`).
- `sw.js`, `manifest.webmanifest`, `icons/`: o que permite instalar a app no ecrã principal.
- `tools/build-demo.py`: gera a versão de demonstração num único ficheiro (não é preciso para a app real).
