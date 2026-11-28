// Configuração da app. Ver GUIA.md para saber onde obter o valor.
// Enquanto googleClientId estiver vazio, a app abre em modo de demonstração.
window.SOUNDBITE_CONFIG = {
  // Nome que aparece no topo da app.
  bandName: "A nossa banda",

  // ID de cliente OAuth (tipo "Aplicação Web") criado na Google Cloud.
  googleClientId: "1049895800962-d4mhu4te1j9ft0g2g3s6rntpgbs6oa6l.apps.googleusercontent.com",

  // Chave da API (do mesmo projeto Google Cloud), só para os links da banda e "ouve isto", que abrem sem login.
  // Restringe-a a https://silvinohenriques.github.io/* e à Google Drive API (ver GUIA.md).
  googleApiKey: ""
};
