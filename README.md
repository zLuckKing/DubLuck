# 🍀 DubLuck v2

**Addon Stremio para conteúdo dublado em PT-BR — 100% independente, sem depender de projetos abandonados.**

Busca torrents diretamente no **BluDV** e **Comando.la** (os maiores sites de torrents dublados do Brasil) e resolve via serviços Debrid para streaming sem travamentos.

---

## ✨ Funcionalidades

- 🇧🇷 Filmes e séries dublados em **Português Brasileiro**
- 🔍 Scraping direto de **BluDV** e **Comando.la** — sem depender do Mico Leão
- ⚡ Suporte a **Real-Debrid**, **AllDebrid**, **Premiumize** e **Debrid-Link**
- 🎛️ Tela de configuração visual antes da instalação
- 🎚️ Filtro de qualidade (4K, 1080p, 720p, 480p, SD)
- 🔑 Validação da chave de API em tempo real
- 📺 Suporte a filmes e séries (com detecção de temporada/episódio)
- 🐳 Pronto para deploy com Docker

---

## 🚀 Como usar

### 1. Hospede no Railway (grátis)

1. Crie conta em [railway.app](https://railway.app) com sua conta GitHub
2. Crie um repositório no GitHub e faça upload de todos os arquivos deste zip
3. No Railway: **New Project → Deploy from GitHub repo**
4. Selecione seu repositório → Railway detecta Node.js automaticamente
5. Clique em **Generate Domain** para obter sua URL pública

### 2. Configure e instale

Acesse `https://sua-url.railway.app/configure` no navegador, configure seu serviço Debrid e instale no Stremio com um clique.

---

## ⚙️ Como funciona

```
Stremio pede stream para tt1234567
        ↓
DubLuck busca no BluDV e Comando.la pelo IMDB ID
        ↓
Encontra magnet links com dublagem PT-BR
        ↓
Envia o magnet para o Real-Debrid (ou outro serviço)
        ↓
Real-Debrid retorna uma URL HTTP direta
        ↓
Stremio reproduz sem travar 🎉
```

---

## 📁 Estrutura

```
dubluck/
├── src/
│   ├── index.js              ← Servidor + rotas Stremio
│   ├── config.js             ← Encode/decode de config na URL
│   ├── debrid/
│   │   ├── index.js          ← Dispatcher dos serviços
│   │   ├── realdebrid.js
│   │   ├── alldebrid.js
│   │   ├── premiumize.js
│   │   └── debridlink.js
│   └── providers/
│       └── ptbr.js           ← Busca no BluDV e Comando.la
├── public/
│   └── configure.html        ← Página de configuração visual
├── Dockerfile
└── package.json
```

---

## 🔑 Obtendo sua chave de API

| Serviço | Link |
|---|---|
| Real-Debrid | https://real-debrid.com/apitoken |
| AllDebrid | https://alldebrid.com/apikeys/ |
| Premiumize | https://www.premiumize.me/account |
| Debrid-Link | https://debrid-link.com/webapp/apikey |

---

## 🛠️ Rodar localmente

```bash
npm install
npm start
# Acesse: http://localhost:7000/configure
```

---

*DubLuck é open-source. Feito para a comunidade brasileira do Stremio. 🇧🇷*
