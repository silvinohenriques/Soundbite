# Soundbite

App web para ouvir e organizar as gravações dos ensaios da banda. Endereço: https://silvinohenriques.github.io/Soundbite/

## Guia de configuração (versão pessoal)

A Soundbite é uma app web para ouvir e organizar as gravações dos ensaios. Nesta fase é só para ti: abres no telemóvel (iPhone ou Android), entras com a tua conta Google e podes "instalá-la" no ecrã principal, sem passar pelas lojas de apps.

## Como funciona

- **As gravações ficam no teu Google Drive**, numa pasta privada chamada *Soundbite – Ensaios* que a própria app cria. Ninguém mais a vê.
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

## Mais tarde: abrir à banda

Quando quiseres partilhar com a banda, a app pode voltar a ter um link de acesso para os colegas. Fica para a próxima fase.

## Ficheiros

- `index.html`, `styles.css`, `app.js`: a app.
- `config.js`: as tuas definições.
- `encoder-worker.js` e `vendor/lame.min.js`: compressão para MP3 (lamejs, licença LGPL, ver `vendor/LAMEJS-LICENSE.txt`).
- `sw.js`, `manifest.webmanifest`, `icons/`: o que permite instalar a app no ecrã principal.
- `tools/build-demo.py`: gera a versão de demonstração num único ficheiro (não é preciso para a app real).
