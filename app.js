// Hub SEM FREIO online. Sem build. Todo texto de dados entra com textContent.
(function () {
  "use strict";

  var app = document.getElementById("app");
  var quem = document.getElementById("quem");
  var quemEmail = document.getElementById("quem-email");
  var btnSair = document.getElementById("btn-sair");
  var cfg = window.CONFIG || {};
  var sb = null;
  var papel = null;       // 'dono' | 'editor' | 'leitor'
  var emRecuperacao = false;
  var abaAtual = "painel";
  var canalAoVivo = null;
  var sequenciaCanal = 0;
  var realtimeConectado = false;
  var timerAoVivo = null;
  var revisaoAba = 0;
  var carregandoAba = false;

  // ---------- utilitários ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") e.className = attrs[k];
        else if (k === "texto") e.textContent = attrs[k];
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }
  function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }
  function urlSegura(u) {
    try { var x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; }
  }
  function link(url, texto) {
    var ok = urlSegura(url);
    if (!ok) return document.createTextNode("—");
    return el("a", { href: ok, target: "_blank", rel: "noopener noreferrer", texto: texto || ok });
  }
  function num(n) {
    return n == null ? "—" : Number(n).toLocaleString("pt-BR");
  }
  function dataHora(iso, semHora) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var o = { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" };
    if (!semHora) { o.hour = "2-digit"; o.minute = "2-digit"; }
    return d.toLocaleString("pt-BR", o) + (semHora ? " (hora aproximada)" : "");
  }
  function dataCurta(d) {
    if (!d) return "—";
    var p = String(d).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(d);
  }
  function nomePlataforma(p) {
    return { youtube: "YouTube", tiktok: "TikTok", kwai: "Kwai", twitch: "Twitch", kick: "Kick" }[p] || p || "—";
  }
  function plataformaFonte(c) {
    if (c.plataforma === "youtube" || /^yt:/.test(c.login || c.canal || "")) return "youtube";
    return c.plataforma === "kick" || /^kick:/.test(c.login || c.canal || "") ? "kick" : "twitch";
  }
  function abrirFonte(c) {
    var p = plataformaFonte(c);
    return "Abrir " + (p === "youtube" ? "no " : "na ") + nomePlataforma(p);
  }
  function mensagem(tipo, texto) { return el("div", { class: "msg " + tipo, texto: texto, role: "alert" }); }
  function traduzErro(e) {
    var m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar. Veja a caixa de entrada (e o spam).";
    if (/not liberado|não liberado|Database error saving new user/i.test(m)) return "Este e-mail não está liberado. Peça ao dono para liberar.";
    if (/already registered|already been registered/i.test(m)) return "Este e-mail já tem conta. Use Entrar ou Esqueci a senha.";
    if (/Password should be at least/i.test(m)) return "A senha precisa de pelo menos 6 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Espere alguns minutos.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Tente de novo.";
    return m;
  }
  function slug(t) {
    return String(t || "video").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase() || "video";
  }
  function campo(rotulo, tipo, nome, extra) {
    var i = el("input", Object.assign({ type: tipo, name: nome, required: "required" }, extra || {}));
    return el("label", null, rotulo, i);
  }

  // ---------- tela: configuração faltando ----------
  function telaSemConfig() {
    limpar(app);
    app.appendChild(el("div", { class: "cartao login" },
      el("h2", null, el("span", { class: "titulo", texto: "Falta configurar" })),
      mensagem("aviso", "Configure o config.js: preencha SUPABASE_URL e SUPABASE_ANON_KEY em hub/web/config.js."),
      el("p", { class: "suave", texto: "O passo a passo está em docs/HUB-ONLINE.md." })
    ));
  }

  // ---------- telas de acesso ----------
  function cartaoLogin(titulo, filhos) {
    pararAoVivo();
    revisaoAba++;
    carregandoAba = false;
    limpar(app);
    quem.classList.add("oculto");
    var c = el("div", { class: "cartao login" }, el("h2", null, el("span", { class: "titulo", texto: titulo })));
    filhos.forEach(function (f) { c.appendChild(f); });
    app.appendChild(c);
  }
  function aviso(c, tipo, texto) {
    var velho = c.querySelector(".msg");
    if (velho) velho.remove();
    c.insertBefore(mensagem(tipo, texto), c.children[1]);
  }
  function enviando(btn, f) {
    btn.disabled = true;
    return Promise.resolve().then(f).then(function () { btn.disabled = false; }, function (e) { btn.disabled = false; throw e; });
  }

  function telaEntrar(msgInicial) {
    var form = el("form", { novalidate: "novalidate" },
      campo("E-mail", "email", "email", { autocomplete: "email" }),
      campo("Senha", "password", "senha", { autocomplete: "current-password" }),
      el("button", { type: "submit", class: "primario", texto: "Entrar" })
    );
    var rodape = el("div", { class: "links-form" },
      el("a", { texto: "Criar conta", onclick: telaCriar }),
      el("a", { texto: "Esqueci a senha", onclick: telaEsqueci })
    );
    cartaoLogin("Entrar", [form, rodape]);
    var c = app.firstChild;
    if (msgInicial) aviso(c, msgInicial.tipo, msgInicial.texto);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = form.querySelector("button");
      enviando(btn, function () {
        return sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.senha.value })
          .then(function (r) { if (r.error) throw r.error; iniciarApp(); });
      }).catch(function (e) { aviso(c, "erro", traduzErro(e)); });
    });
  }

  function telaCriar() {
    var form = el("form", { novalidate: "novalidate" },
      campo("E-mail (o mesmo que o dono liberou)", "email", "email", { autocomplete: "email" }),
      campo("Senha (mínimo 6 caracteres)", "password", "senha", { autocomplete: "new-password", minlength: "6" }),
      el("button", { type: "submit", class: "primario", texto: "Criar conta" })
    );
    var rodape = el("div", { class: "links-form" }, el("a", { texto: "Já tenho conta", onclick: function () { telaEntrar(); } }));
    cartaoLogin("Criar conta", [form, rodape]);
    var c = app.firstChild;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = form.querySelector("button");
      enviando(btn, function () {
        return sb.auth.signUp({
          email: form.email.value.trim(), password: form.senha.value,
          options: { emailRedirectTo: location.origin + location.pathname }
        }).then(function (r) {
          if (r.error) throw r.error;
          aviso(c, "ok", "Quase lá! Enviamos um e-mail de confirmação. Clique no link dele e depois volte e entre.");
          form.reset();
        });
      }).catch(function (e) { aviso(c, "erro", traduzErro(e)); });
    });
  }

  function telaEsqueci() {
    var form = el("form", { novalidate: "novalidate" },
      campo("E-mail", "email", "email", { autocomplete: "email" }),
      el("button", { type: "submit", class: "primario", texto: "Enviar link" })
    );
    var rodape = el("div", { class: "links-form" }, el("a", { texto: "Voltar", onclick: function () { telaEntrar(); } }));
    cartaoLogin("Esqueci a senha", [form, rodape]);
    var c = app.firstChild;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = form.querySelector("button");
      enviando(btn, function () {
        return sb.auth.resetPasswordForEmail(form.email.value.trim(), { redirectTo: location.origin + location.pathname })
          .then(function (r) {
            if (r.error) throw r.error;
            aviso(c, "ok", "Se este e-mail tiver conta, enviamos um link para criar uma senha nova.");
          });
      }).catch(function (e) { aviso(c, "erro", traduzErro(e)); });
    });
  }

  function telaNovaSenha() {
    var form = el("form", { novalidate: "novalidate" },
      campo("Senha nova (mínimo 6 caracteres)", "password", "senha", { autocomplete: "new-password", minlength: "6" }),
      campo("Repita a senha nova", "password", "senha2", { autocomplete: "new-password", minlength: "6" }),
      el("button", { type: "submit", class: "primario", texto: "Salvar senha nova" })
    );
    cartaoLogin("Senha nova", [form]);
    var c = app.firstChild;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (form.senha.value !== form.senha2.value) { aviso(c, "erro", "As senhas não são iguais."); return; }
      var btn = form.querySelector("button");
      enviando(btn, function () {
        return sb.auth.updateUser({ password: form.senha.value }).then(function (r) {
          if (r.error) throw r.error;
          emRecuperacao = false;
          history.replaceState(null, "", location.pathname);
          iniciarApp();
        });
      }).catch(function (e) { aviso(c, "erro", traduzErro(e)); });
    });
  }

  // ---------- app principal ----------
  function iniciarApp() {
    // descobre o papel; sem linha em membros = e-mail não liberado
    sb.from("membros").select("papel").limit(1).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) {
        cartaoLogin("Sem acesso", [
          mensagem("erro", "Este e-mail não está liberado para o hub. Peça ao dono para liberar."),
          el("button", { type: "button", texto: "Sair", onclick: sair })
        ]);
        return;
      }
      papel = r.data[0].papel;
      sb.auth.getUser().then(function (u) {
        quemEmail.textContent = (u.data && u.data.user ? u.data.user.email : "") + " · " + papel;
        quem.classList.remove("oculto");
      });
      desenharShell();
      iniciarAoVivo();
    }).catch(function (e) {
      cartaoLogin("Erro", [mensagem("erro", traduzErro(e)), el("button", { type: "button", texto: "Sair", onclick: sair })]);
    });
  }

  function sair() {
    sb.auth.signOut().then(function () { papel = null; telaEntrar(); });
  }

  var abas = [
    { id: "painel", nome: "Painel", fn: abaPainel },
    { id: "clips", nome: "Clips", fn: abaClips },
    { id: "aprovacao", nome: "Aprovação", fn: abaAprovacao },
    { id: "relatorios", nome: "Relatórios", fn: abaRelatorios },
    { id: "contas", nome: "Contas", fn: abaCanais },
    { id: "videos", nome: "Vídeos", fn: abaVideos },
    { id: "qg", nome: "QG", fn: abaQG },
    { id: "hub", nome: "Hub de contas", fn: abaContas }
  ];

  function desenharShell() {
    limpar(app);
    var nav = el("nav", { class: "abas", role: "tablist" });
    var corpo = el("section", { id: "corpo" });
    abas.forEach(function (a) {
      nav.appendChild(el("button", {
        type: "button", "data-aba": a.id, role: "tab", texto: a.nome,
        onclick: function () { abrirAba(a.id); }
      }));
    });
    app.appendChild(nav);
    app.appendChild(el("div", { style: "height:16px" }));
    app.appendChild(corpo);
    abrirAba(abaAtual);
  }

  function abrirAba(id, silencioso) {
    abaAtual = id;
    Array.prototype.forEach.call(app.querySelectorAll("nav.abas button"), function (b) {
      b.classList.toggle("ativa", b.getAttribute("data-aba") === id);
    });
    var corpo = document.getElementById("corpo");
    if (!corpo) return;
    var revisao = ++revisaoAba;
    carregandoAba = true;
    if (!silencioso) {
      limpar(corpo);
      corpo.appendChild(el("p", { class: "suave", texto: "Carregando..." }));
    }
    var aba = abas.filter(function (a) { return a.id === id; })[0];
    aba.fn().then(function (no) {
      if (revisao !== revisaoAba || abaAtual !== id) return;
      carregandoAba = false;
      // atualização automática não interrompe quem está assistindo ou digitando
      if (silencioso && (document.hidden || ocupado(corpo))) {
        agendarAtualizacao();
        return;
      }
      limpar(corpo);
      corpo.appendChild(no);
    }).catch(function (e) {
      if (revisao !== revisaoAba || abaAtual !== id) return;
      carregandoAba = false;
      if (silencioso) return;
      limpar(corpo);
      corpo.appendChild(mensagem("erro", "Não deu para carregar: " + traduzErro(e)));
    });
  }

  function ocupado(corpo) {
    // O player Twitch não expõe o estado e não tem botão para fechar: sua
    // presença não pode impedir indefinidamente decisões vindas do Telegram.
    var v = corpo.querySelectorAll("video");
    for (var i = 0; i < v.length; i++) if (!v[i].paused) return true;
    var t = corpo.querySelectorAll("textarea, input");
    for (var k = 0; k < t.length; k++) {
      if (t[k] === document.activeElement) return true;
      if ((t[k].tagName === "TEXTAREA" || t[k].type === "datetime-local") && t[k].value) return true;
    }
    return false;
  }

  // O estado dos filtros (fClips) continua fora do DOM ao redesenhar a aba.
  function abaAoVivo() {
    return ["clips", "aprovacao", "videos"].indexOf(abaAtual) >= 0;
  }
  function agendarAtualizacao() {
    if (!papel || document.hidden || !abaAoVivo()) return;
    clearTimeout(timerAoVivo);
    timerAoVivo = setTimeout(function () {
      timerAoVivo = null;
      if (!papel || document.hidden || !abaAoVivo()) return;
      var corpo = document.getElementById("corpo");
      if (!corpo) return;
      if (carregandoAba || ocupado(corpo)) { agendarAtualizacao(); return; }
      abrirAba(abaAtual, true);
    }, 1500);
  }
  function pararAoVivo() {
    clearTimeout(timerAoVivo);
    timerAoVivo = null;
    realtimeConectado = false;
    var antigo = canalAoVivo;
    canalAoVivo = null;
    if (antigo) {
      try {
        Promise.resolve(sb.removeChannel(antigo)).catch(function () { /* fallback continua ativo */ });
      } catch (e) { /* fallback continua ativo */ }
    }
  }
  function iniciarAoVivo() {
    if (!papel || document.hidden || canalAoVivo) return;
    try {
      // O canal anterior pode ainda estar terminando a desconexão no servidor.
      var canal = sb.channel("hub-ao-vivo-" + (++sequenciaCanal));
      canalAoVivo = canal;
      canal.on("postgres_changes", { event: "*", schema: "public", table: "clips" }, agendarAtualizacao)
        .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, agendarAtualizacao)
        .subscribe(function (status) {
          if (canalAoVivo !== canal) return;
          realtimeConectado = status === "SUBSCRIBED";
          // Recupera também mudanças ocorridas durante uma desconexão.
          if (realtimeConectado) agendarAtualizacao();
        });
    } catch (e) {
      pararAoVivo();
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pararAoVivo();
    else if (papel && document.getElementById("corpo")) {
      iniciarAoVivo();
      agendarAtualizacao();
    }
  });
  // Sem realtime, verifica a aba aberta a cada 30 s. Não consulta em segundo plano.
  setInterval(function () {
    if (!papel || document.hidden || realtimeConectado) return;
    agendarAtualizacao();
  }, 30000);
  // As lives da aba Contas não usam a publicação realtime.
  setInterval(function () {
    if (!papel || document.hidden || carregandoAba) return;
    if (abaAtual === "contas") abrirAba(abaAtual, true);
  }, 60000);

  function ler(q) {
    return q.then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }

  // ---------- Painel ----------
  function abaPainel() {
    return Promise.all([
      ler(sb.from("videos").select("id,titulo,plataforma,streamer")),
      ler(sb.from("ultimas_metricas").select("*")),
      ler(sb.from("metricas").select("video_id,coletado_em,views").order("coletado_em", { ascending: true }).limit(5000))
    ]).then(function (res) {
      var videos = res[0], ult = res[1], hist = res[2];
      var porVideo = {};
      ult.forEach(function (m) { porVideo[m.video_id] = m; });
      var wrap = el("div");

      // totais por plataforma
      var plats = {};
      videos.forEach(function (v) {
        var p = v.plataforma || "outra";
        var t = plats[p] || (plats[p] = { views: 0, likes: 0, comentarios: 0, videos: 0 });
        var m = porVideo[v.id] || {};
        t.videos++; t.views += m.views || 0; t.likes += m.likes || 0; t.comentarios += m.comentarios || 0;
      });
      var grade = el("div", { class: "grade" });
      Object.keys(plats).forEach(function (p) {
        var t = plats[p];
        grade.appendChild(el("div", { class: "cartao" },
          el("h2", null, el("span", { class: "titulo", texto: nomePlataforma(p) })),
          el("div", { class: "totais" },
            bloco("Views", t.views), bloco("Curtidas", t.likes), bloco("Comentários", t.comentarios), bloco("Vídeos", t.videos)
          )
        ));
      });
      if (!Object.keys(plats).length) grade.appendChild(el("div", { class: "cartao", texto: "Nenhum vídeo publicado ainda." }));
      wrap.appendChild(grade);

      // última atualização
      var ultima = ult.reduce(function (a, m) { return !a || m.coletado_em > a ? m.coletado_em : a; }, null);
      wrap.appendChild(el("p", { class: "suave", texto: ultima ? "Última atualização: " + dataHora(ultima) : "Ainda não há coleta de métricas." }));

      // gráfico
      var cart = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Views totais por coleta" })));
      cart.appendChild(grafico(hist));
      wrap.appendChild(cart);

      // tabela por vídeo
      var tab = el("table", null,
        el("thead", null, el("tr", null,
          el("th", { texto: "Vídeo" }), el("th", { texto: "Rede" }),
          el("th", { class: "n", texto: "Views" }), el("th", { class: "n", texto: "Curtidas" }), el("th", { class: "n", texto: "Coment." })
        ))
      );
      var tb = el("tbody");
      videos.forEach(function (v) {
        var m = porVideo[v.id] || {};
        tb.appendChild(el("tr", null,
          el("td", { texto: v.titulo || v.id }), el("td", { texto: nomePlataforma(v.plataforma) }),
          el("td", { class: "n", texto: num(m.views) }), el("td", { class: "n", texto: num(m.likes) }), el("td", { class: "n", texto: num(m.comentarios) })
        ));
      });
      tab.appendChild(tb);
      wrap.appendChild(el("div", { class: "cartao" },
        el("h2", null, el("span", { class: "titulo", texto: "Por vídeo (última coleta)" })),
        el("div", { class: "tabela-rolavel" }, tab),
        el("p", { class: "suave", texto: "\"—\" quer dizer que a rede não mostra esse número." })
      ));
      return wrap;
    });
  }
  function bloco(rotulo, valor) {
    return el("div", null, el("span", { class: "valor num", texto: num(valor) }), el("span", { class: "rotulo", texto: rotulo }));
  }

  function grafico(hist) {
    // soma as views de todos os vídeos em cada coleta
    var porColeta = {};
    hist.forEach(function (m) { porColeta[m.coletado_em] = (porColeta[m.coletado_em] || 0) + (m.views || 0); });
    var chaves = Object.keys(porColeta).sort();
    if (!chaves.length) return el("p", { class: "suave", texto: "Sem dados para o gráfico." });
    var NS = "http://www.w3.org/2000/svg", W = 600, H = 200, ML = 48, MR = 14, MT = 14, MB = 30;
    function s(tag, a) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, class: "grafico", role: "img", "aria-label": "Views totais por coleta" });
    var vals = chaves.map(function (k) { return porColeta[k]; });
    var max = Math.max.apply(null, vals.concat([1]));
    function x(i) { return chaves.length === 1 ? (ML + (W - ML - MR) / 2) : ML + i * (W - ML - MR) / (chaves.length - 1); }
    function y(v) { return MT + (H - MT - MB) * (1 - v / max); }
    [0, 0.5, 1].forEach(function (f) {
      var yy = y(max * f);
      svg.appendChild(s("line", { x1: ML, x2: W - MR, y1: yy, y2: yy, stroke: "#302d26" }));
      var t = s("text", { x: ML - 6, y: yy + 4, "text-anchor": "end", fill: "#a59f8f", "font-size": "11", "font-family": "JetBrains Mono, monospace" });
      t.textContent = num(Math.round(max * f));
      svg.appendChild(t);
    });
    svg.appendChild(s("polyline", {
      points: vals.map(function (v, i) { return x(i) + "," + y(v); }).join(" "),
      fill: "none", stroke: "#FACC15", "stroke-width": "3"
    }));
    vals.forEach(function (v, i) {
      svg.appendChild(s("circle", { cx: x(i), cy: y(v), r: 4, fill: "#FACC15" }));
      if (chaves.length <= 8 || i === 0 || i === chaves.length - 1) {
        var d = new Date(chaves[i]);
        var t = s("text", { x: x(i), y: H - 10, "text-anchor": "middle", fill: "#a59f8f", "font-size": "11", "font-family": "JetBrains Mono, monospace" });
        t.textContent = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        svg.appendChild(t);
      }
    });
    return svg;
  }

  // ---------- Vídeos ----------
  function abaVideos() {
    return Promise.all([
      ler(sb.from("videos").select("*").order("data", { ascending: false })),
      ler(sb.from("ultimas_metricas").select("video_id,views"))
    ]).then(function (res) {
      var caminhos = Array.from(new Set(res[0].map(function (v) { return v.capa_path; }).filter(Boolean)));
      var pUrls = caminhos.length ? sb.storage.from("videos").createSignedUrls(caminhos, 3600) : Promise.resolve({ data: [] });
      return pUrls.catch(function () { return { data: [] }; }).then(function (rUrls) {
        var urls = {};
        ((rUrls && rUrls.data) || []).forEach(function (u) {
          if (u && !u.error && u.signedUrl && urlSegura(u.signedUrl)) urls[u.path] = urlSegura(u.signedUrl);
        });
        var views = {};
        res[1].forEach(function (m) { views[m.video_id] = m.views; });
        var cart = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Vídeos postados" })));
        var aviso2 = el("div");
        cart.appendChild(aviso2);
        var tab = el("table", null, el("thead", null, el("tr", null,
          el("th", { texto: "Capa" }), el("th", { texto: "Título" }), el("th", { texto: "Streamer" }), el("th", { texto: "Rede" }),
          el("th", { texto: "Data" }), el("th", { texto: "Link" }), el("th", { class: "n", texto: "Views" }), el("th", { texto: "" })
        )));
        var tb = el("tbody");
        res[0].forEach(function (v) {
          var capa = el("td", { texto: "—" });
          if (urls[v.capa_path]) {
            limpar(capa);
            capa.appendChild(el("img", {
              src: urls[v.capa_path], alt: v.titulo || v.id, height: "64", loading: "lazy",
              style: "height:64px;width:auto;border-radius:8px;display:block",
              onerror: function () { limpar(capa); capa.textContent = "—"; }
            }));
          }
          // a cópia para baixar saiu do hub (economia de espaço): o vídeo fica no link "Abrir"
          var btn = el("span", { class: "suave", texto: "—" });
          if (v.arquivo_path) {
            btn = el("button", { type: "button", texto: "Baixar" });
            btn.addEventListener("click", function () { baixar(v, btn, aviso2); });
          }
          tb.appendChild(el("tr", null,
            capa,
            el("td", { texto: v.titulo || v.id }), el("td", { texto: v.streamer || "—" }), el("td", { texto: nomePlataforma(v.plataforma) }),
            el("td", { texto: dataCurta(v.data) }), el("td", null, link(v.link, "Abrir")),
            el("td", { class: "n", texto: num(views[v.id]) }), el("td", null, btn)
          ));
        });
        if (!res[0].length) tb.appendChild(el("tr", null, el("td", { colspan: "8", texto: "Nenhum vídeo ainda." })));
        tab.appendChild(tb);
        cart.appendChild(el("div", { class: "tabela-rolavel" }, tab));
        return cart;
      });
    });
  }

  function baixar(v, btn, aviso2) {
    limpar(aviso2);
    btn.disabled = true;
    var nome = slug(v.titulo) + ".mp4";
    sb.storage.from("videos").createSignedUrl(v.arquivo_path, 3600, { download: nome }).then(function (r) {
      btn.disabled = false;
      if (r.error || !r.data || !urlSegura(r.data.signedUrl)) {
        aviso2.appendChild(mensagem("erro", "Este vídeo ainda não foi enviado para o servidor. Peça para rodar o sync_hub.py."));
        return;
      }
      var a = el("a", { href: urlSegura(r.data.signedUrl), download: nome, rel: "noopener" });
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { btn.disabled = false; aviso2.appendChild(mensagem("erro", traduzErro(e))); });
  }

  // ---------- QG ----------
  function abaQG() {
    return Promise.all([
      ler(sb.from("diario").select("*").order("quando", { ascending: false })),
      ler(sb.from("pedidos").select("*").order("criado_em", { ascending: false })),
      ler(sb.from("respostas").select("*").order("id", { ascending: true }))
    ]).then(function (res) {
      var wrap = el("div");

      // formulário de pedido (dono/editor)
      if (papel === "dono" || papel === "editor") {
        var f = el("form", null,
          el("label", null, "Escreva o pedido", el("textarea", { name: "texto", maxlength: "2000", required: "required", placeholder: "Ex.: fazer um corte do Cellbit com a nota mais alta" })),
          el("button", { type: "submit", class: "primario", texto: "Enviar pedido" })
        );
        var area = el("div");
        f.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var texto = f.texto.value.trim();
          if (!texto) return;
          var btn = f.querySelector("button");
          btn.disabled = true;
          sb.from("pedidos").insert({ texto: texto }).then(function (r) {
            btn.disabled = false;
            if (r.error) { limpar(area); area.appendChild(mensagem("erro", "Não foi possível enviar: " + traduzErro(r.error))); return; }
            abrirAba("qg");
          });
        });
        wrap.appendChild(el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Novo pedido" })), area, f,
          el("p", { class: "suave", texto: "Os pedidos só são feitos depois do OK do dono." })));
      }

      // pedidos
      var respPorPedido = {};
      res[2].forEach(function (r) { (respPorPedido[r.pedido_id] = respPorPedido[r.pedido_id] || []).push(r); });
      var cp = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Pedidos" })));
      res[1].forEach(function (p) {
        var rs = respPorPedido[p.id] || [];
        var ultima = rs.length ? rs[rs.length - 1] : null;
        var st = ultima ? ultima.status : "aguardando";
        var item = el("div", { class: "item" },
          el("div", { class: "quando", texto: dataHora(p.criado_em) + " · " + (p.autor_email || "") }),
          el("p", { texto: p.texto }),
          el("span", { class: "etiqueta st-" + st, texto: st })
        );
        if (ultima && ultima.texto) item.appendChild(el("p", { class: "suave", texto: "Resposta: " + ultima.texto }));
        cp.appendChild(item);
      });
      if (!res[1].length) cp.appendChild(el("p", { class: "suave", texto: "Nenhum pedido ainda." }));
      wrap.appendChild(cp);

      // diário
      var cd = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Diário do Claude" })));
      res[0].forEach(function (d) {
        cd.appendChild(el("div", { class: "item" },
          el("div", { class: "quando", texto: dataHora(d.quando, d.sem_hora) }),
          el("h3", { texto: d.titulo }),
          d.pedido ? el("p", { texto: "Pedido: " + d.pedido }) : null,
          d.feito ? linkificar(d.feito) : null
        ));
      });
      if (!res[0].length) cd.appendChild(el("p", { class: "suave", texto: "Diário vazio." }));
      wrap.appendChild(cd);
      return wrap;
    });
  }

  // texto "Feito: ..." com links https clicáveis (sem innerHTML)
  function linkificar(texto) {
    var p = el("p");
    p.appendChild(document.createTextNode("Feito: "));
    String(texto).split(/(https:\/\/[^\s]+)/g).forEach(function (parte) {
      if (/^https:\/\//.test(parte) && urlSegura(parte)) p.appendChild(link(parte));
      else if (parte) p.appendChild(document.createTextNode(parte));
    });
    return p;
  }


  // ---------- ajudas das abas novas ----------
  function podeEditar() { return papel === "dono" || papel === "editor"; }
  function idadeTxt(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "—";
    var min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60);
    if (h < 48) return h + " h" + (min % 60 && h < 10 ? " " + (min % 60) + " min" : "");
    return Math.floor(h / 24) + " dias";
  }
  function duracaoTxt(seg) {
    if (seg == null) return "—";
    var n = Math.round(seg);
    return Math.floor(n / 60) + ":" + ("0" + (n % 60)).slice(-2);
  }
  function selo(nota) {
    if (nota == null) return { txt: "Vídeo especial", cls: "n80" };   // explicador etc.: não veio de clipe, sem nota
    if (nota >= 90) return { txt: "Excepcional", cls: "n90" };
    if (nota >= 80) return { txt: "Excelente", cls: "n80" };
    if (nota >= 70) return { txt: "Bom", cls: "n70" };
    if (nota >= 60) return { txt: "Moderado", cls: "n60" };
    return { txt: "Baixo (testar)", cls: "n60" };
  }
  function grupoDe(c) {
    var e = c.espectadores;
    if (e == null) return null;
    if (e < 300) return { id: "pequeno", nome: "Pequeno" };
    if (e <= 2000) return { id: "medio", nome: "Médio" };
    return { id: "grande", nome: "Grande" };
  }
  function imgSegura(url, alt, cls) {
    var u = urlSegura(String(url || "").replace(/%?\{width\}/g, "320").replace(/%?\{height\}/g, "180"));
    if (!u) return el("div", { class: cls + " vazio" });
    return el("img", { src: u, alt: alt || "", class: cls, loading: "lazy", referrerpolicy: "no-referrer" });
  }
  function seletor(rotulo, opcoes, valor, aoMudar) {
    var s = el("select");
    opcoes.forEach(function (o) {
      var op = el("option", { value: o[0], texto: o[1] });
      if (String(o[0]) === String(valor)) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener("change", function () { aoMudar(s.value); });
    return el("label", null, rotulo, s);
  }
  function barraTopo(titulo) {
    return el("div", { class: "barra-topo" },
      el("h2", null, el("span", { class: "titulo", texto: titulo })),
      el("button", { type: "button", texto: "Atualizar", onclick: function () { abrirAba(abaAtual); } })
    );
  }
  function vazio(titulo, texto) {
    return el("div", { class: "cartao vazio-msg" }, el("h3", { texto: titulo }), el("p", { class: "suave", texto: texto }));
  }

  // ---------- Contas (canais da Twitch, Kick e YouTube) ----------
  var fCanais = { vis: "vivo", marca: "todas", grupo: "todos", busca: "" };

  function abaCanais() {
    return ler(sb.from("canais").select("*").order("espectadores", { ascending: false, nullsFirst: false }).limit(1000)).then(function (canais) {
      var wrap = el("div");
      wrap.appendChild(barraTopo("Canais jogando GTA"));
      if (!canais.length) {
        wrap.appendChild(vazio("Ainda não há canais", "A rotina busca canais da Twitch, Kick e YouTube jogando GTA. Volte daqui a pouco."));
        return wrap;
      }
      var lista = el("div", { class: "grade-canais" });
      var cont = el("p", { class: "suave" });
      var busca = el("input", { type: "search", placeholder: "Buscar por nome", value: fCanais.busca });
      busca.addEventListener("input", function () { fCanais.busca = busca.value; desenhar(); });
      wrap.appendChild(el("div", { class: "filtros" },
        seletor("Mostrar", [["vivo", "Ao vivo"], ["todos", "Todos"]], fCanais.vis, function (v) { fCanais.vis = v; desenhar(); }),
        seletor("Marca", [["todas", "Todas"], ["quero", "Quero cortes"], ["nao_quero", "Não quero"], ["sem", "Sem marca"]], fCanais.marca, function (v) { fCanais.marca = v; desenhar(); }),
        seletor("Grupo", [["todos", "Todos"], ["pequeno", "Pequeno (< 300)"], ["medio", "Médio (300 a 2.000)"], ["grande", "Grande (> 2.000)"]], fCanais.grupo, function (v) { fCanais.grupo = v; desenhar(); }),
        el("label", null, "Buscar", busca)
      ));
      wrap.appendChild(cont);
      wrap.appendChild(lista);

      function desenhar() {
        limpar(lista);
        var b = fCanais.busca.trim().toLowerCase();
        var vis = canais.filter(function (c) {
          if (fCanais.vis === "vivo" && !c.ao_vivo) return false;
          if (fCanais.marca === "quero" && c.flag !== "quero") return false;
          if (fCanais.marca === "nao_quero" && c.flag !== "nao_quero") return false;
          if (fCanais.marca === "sem" && c.flag) return false;
          var g = grupoDe(c);
          if (fCanais.grupo !== "todos" && (!g || g.id !== fCanais.grupo)) return false;
          if (b && ((c.nome || "") + " " + c.login).toLowerCase().indexOf(b) < 0) return false;
          return true;
        });
        vis.sort(function (a, c) {
          if (a.ao_vivo !== c.ao_vivo) return a.ao_vivo ? -1 : 1;
          return (c.espectadores || 0) - (a.espectadores || 0);
        });
        cont.textContent = vis.length + " canal(is)";
        if (!vis.length) lista.appendChild(el("p", { class: "suave", texto: "Nenhum canal com esses filtros." }));
        vis.forEach(function (c) { lista.appendChild(cartaoCanal(c, desenhar)); });
      }
      desenhar();
      return wrap;
    });
  }

  function cartaoCanal(c, redesenhar) {
    var g = grupoDe(c);
    var plataforma = plataformaFonte(c);
    var login = String(c.login || "").replace(plataforma === "youtube" ? /^yt:/ : /^kick:/, "");
    var dominio = plataforma === "kick" ? "kick.com/" : "www.twitch.tv/";
    var urlCanal = plataforma === "youtube" ? (urlSegura(c.url) || "https://www.youtube.com/channel/" + encodeURIComponent(login)) : "https://" + dominio + encodeURIComponent(login);
    var capa = c.ao_vivo && urlSegura(c.thumb_url) ? imgSegura(c.thumb_url, "Miniatura da live", "canal-thumb") : null;
    var cab = el("div", { class: "canal-cab" },
      imgSegura(c.avatar_url, "", "avatar"),
      el("div", { class: "canal-nome" },
        el("strong", { texto: c.nome || c.login }),
        el("span", { class: "suave", texto: plataforma === "youtube" ? "YouTube" : "@" + login })
      ),
      c.ao_vivo ? el("span", { class: "etiqueta ao-vivo", texto: "AO VIVO" }) : el("span", { class: "etiqueta", texto: "Offline" })
    );
    var info = el("div", { class: "canal-info" });
    if (c.ao_vivo) {
      info.appendChild(el("p", { class: "canal-titulo", texto: c.titulo || "Sem título" }));
      info.appendChild(el("p", { class: "suave num", texto: num(c.espectadores) + " espectadores · há " + idadeTxt(c.inicio_live) + " ao vivo" }));
    } else {
      info.appendChild(el("p", { class: "suave num", texto: num(c.seguidores) + " seguidores" }));
    }
    var linha = el("div", { class: "linha-selos" });
    linha.appendChild(el("span", { class: "etiqueta", texto: nomePlataforma(plataforma) }));
    if (g) linha.appendChild(el("span", { class: "etiqueta grupo-" + g.id, texto: g.nome }));
    linha.appendChild(link(urlCanal, plataforma === "youtube" ? "Abrir canal no YouTube" : dominio.replace(/^www\./, "") + login));
    info.appendChild(linha);

    var acoes = el("div", { class: "acoes" });
    if (podeEditar()) {
      [["quero", "Quero cortes"], ["nao_quero", "Não quero"]].forEach(function (par) {
        var b = el("button", { type: "button", texto: par[1], class: c.flag === par[0] ? "ativa" + (par[0] === "nao_quero" ? " ruim" : "") : "" });
        b.addEventListener("click", function () {
          var novo = c.flag === par[0] ? null : par[0];
          b.disabled = true;
          sb.rpc("marcar_canal", { p_login: c.login, p_flag: novo }).then(function (r) {
            if (r.error) { b.disabled = false; alert("Não foi possível marcar: " + traduzErro(r.error)); return; }
            c.flag = novo;
            redesenhar();
          });
        });
        acoes.appendChild(b);
      });
    } else if (c.flag) {
      acoes.appendChild(el("span", { class: "etiqueta", texto: c.flag === "quero" ? "Quero cortes" : "Não quero" }));
    }
    return el("div", { class: "cartao canal" + (c.flag === "nao_quero" ? " apagado" : "") + (c.flag === "quero" ? " marcado" : "") }, cab, capa, info, acoes);
  }

  // ---------- Clips ----------
  var fClips = { criador: "todos", periodo: "tudo", nota: "45", status: "todos", ordem: "nota" };
  var ROTULO_STATUS = {
    novo: "Novo", avaliado: "Avaliado", pedido_corte: "Na fila de edição", cortando: "Cortando",
    em_aprovacao: "Aguardando aprovação", aprovado: "Aprovado", recusado: "Recusado", publicado: "Publicado", erro: "Erro no corte", descartado: "Descartado"
  };

  function abaClips() {
    return ler(sb.from("canais").select("login,nome").eq("flag", "quero")).then(function (queridos) {
      var wrap = el("div");
      wrap.appendChild(barraTopo("Clips para cortar"));
      if (!queridos.length) {
        wrap.appendChild(vazio("Nenhum canal marcado", "Marque canais como Quero cortes na aba Contas; a cada hora entram os clipes avaliados."));
        return wrap;
      }
      var nomes = {};
      queridos.forEach(function (c) { nomes[c.login] = c.nome || c.login; });
      return ler(sb.from("clips").select("*").gt("nota", 45).neq("status", "descartado")
        .in("canal", queridos.map(function (c) { return c.login; })).order("nota", { ascending: false }).limit(500))
        .then(function (clips) {
          if (!clips.length) {
            wrap.appendChild(vazio("Nenhum clipe avaliado ainda", "Os canais marcados já estão na lista. A cada 15 minutos entram clipes novos; aparecem os com nota acima de 45."));
            return wrap;
          }
          var lista = el("div", { class: "grade-clips" });
          var cont = el("p", { class: "suave" });
          var opCriador = [["todos", "Todos"]].concat(queridos.map(function (c) { return [c.login, c.nome || c.login]; }));
          var stats = Object.keys(ROTULO_STATUS).filter(function (k) { return k !== "descartado" && k !== "novo"; });
          wrap.appendChild(el("div", { class: "filtros" },
            seletor("Criador", opCriador, fClips.criador, function (v) { fClips.criador = v; desenhar(); }),
            seletor("Período", [["24", "24 h"], ["168", "7 dias"], ["720", "30 dias"], ["tudo", "Tudo"]], fClips.periodo, function (v) { fClips.periodo = v; desenhar(); }),
            seletor("Nota mínima", [["45", "45"], ["60", "60"], ["70", "70"], ["80", "80"], ["90", "90"]], fClips.nota, function (v) { fClips.nota = v; desenhar(); }),
            seletor("Situação", [["todos", "Todas"]].concat(stats.map(function (k) { return [k, ROTULO_STATUS[k]]; })), fClips.status, function (v) { fClips.status = v; desenhar(); }),
            seletor("Ordenar por", [["nota", "Nota"], ["views", "Views"], ["recentes", "Mais recentes"]], fClips.ordem, function (v) { fClips.ordem = v; desenhar(); })
          ));
          wrap.appendChild(cont);
          wrap.appendChild(lista);

          function desenhar() {
            limpar(lista);
            var corte = fClips.periodo === "tudo" ? 0 : Date.now() - Number(fClips.periodo) * 3600000;
            var vis = clips.filter(function (c) {
              if (fClips.criador !== "todos" && c.canal !== fClips.criador) return false;
              if (corte && new Date(c.criado_em).getTime() < corte) return false;
              if ((c.nota || 0) < Number(fClips.nota)) return false;
              if (fClips.status !== "todos" && c.status !== fClips.status) return false;
              return true;
            });
            vis.sort(function (a, b) {
              if (fClips.ordem === "views") return (b.views || 0) - (a.views || 0);
              if (fClips.ordem === "recentes") return new Date(b.criado_em) - new Date(a.criado_em);
              return (b.nota || 0) - (a.nota || 0);
            });
            cont.textContent = vis.length + " clipe(s)";
            if (!vis.length) lista.appendChild(el("p", { class: "suave", texto: "Nenhum clipe com esses filtros." }));
            vis.forEach(function (c) { lista.appendChild(cartaoClip(c, nomes[c.canal] || c.canal || "—", desenhar)); });
          }
          desenhar();
          return wrap;
        });
    });
  }

  function playerClip(c, caixa) {
    if (plataformaFonte(c) === "kick" || plataformaFonte(c) === "youtube") {
      var miniatura = imgSegura(c.thumb_url, "Miniatura do clipe · " + nomePlataforma(plataformaFonte(c)), "clip-thumb");
      if (urlSegura(c.url)) {
        var abrir = link(c.url, "");
        limpar(abrir);
        abrir.setAttribute("aria-label", abrirFonte(c));
        abrir.appendChild(miniatura);
        caixa.appendChild(abrir);
      } else {
        caixa.appendChild(miniatura);
      }
      return;
    }
    var slug = c.embed_slug;
    caixa.appendChild(imgSegura(c.thumb_url, "", "clip-thumb"));
    if (!slug) return;
    var btn = el("button", { type: "button", class: "play", "aria-label": "Assistir clipe", texto: "▶" });
    btn.addEventListener("click", function () {
      var f = el("iframe", {
        src: "https://clips.twitch.tv/embed?clip=" + encodeURIComponent(slug) + "&parent=" + encodeURIComponent(location.hostname) + "&autoplay=true",
        allowfullscreen: "true", allow: "autoplay; fullscreen", title: "Clipe", class: "clip-iframe"
      });
      limpar(caixa);
      caixa.appendChild(f);
    });
    caixa.appendChild(btn);
  }

  function seloTelegram(c) {
    var obs = typeof c.obs === "string" ? c.obs : "";
    var prefixos = ["Decidido no Telegram por ", "Horário escolhido no Telegram por "];
    for (var i = 0; i < prefixos.length; i++) {
      if (obs.indexOf(prefixos[i]) !== 0) continue;
      var nome = obs.slice(prefixos[i].length).replace(/\s+\([^()]*\)\s*$/, "").trim();
      return nome ? el("span", { class: "etiqueta", texto: "via Telegram · " + nome }) : null;
    }
    return null;
  }

  function cartaoClip(c, nomeCanal, redesenhar) {
    var a = c.avaliacao || {};
    var sl = selo(c.nota || 0);
    var caixa = el("div", { class: "clip-caixa" });
    playerClip(c, caixa);
    var corpo = el("div", { class: "clip-corpo" },
      el("div", { class: "linha-selos" },
        el("span", { class: "nota num " + sl.cls, texto: String(c.nota) }),
        el("span", { class: "etiqueta " + sl.cls, texto: sl.txt }),
        el("span", { class: "etiqueta", texto: nomePlataforma(plataformaFonte(c)) }),
        a.classificacao ? el("span", { class: "etiqueta", texto: String(a.classificacao) }) : null,
        seloTelegram(c)
      ),
      el("h3", { class: "clip-titulo", texto: c.titulo || "Sem título" }),
      a.resumo ? el("p", { texto: String(a.resumo) }) : null,
      a.gancho ? el("p", { class: "suave", texto: "Gancho: " + a.gancho }) : null,
      el("p", { class: "suave num", texto: nomeCanal + " · " + num(c.views) + " views · " + duracaoTxt(c.duracao) + " · há " + idadeTxt(c.criado_em) }),
      urlSegura(c.url) ? el("p", { class: "suave" }, link(c.url, abrirFonte(c))) : null
    );
    if (c.status === "aprovado" && c.publicar_em && dataHora(c.publicar_em)) {
      corpo.appendChild(el("p", { class: "suave", texto: "Publicação: " + dataHora(c.publicar_em) + " (Brasília)" }));
    }
    var rodape = el("div", { class: "acoes" }, el("span", { class: "etiqueta st-clip-" + c.status, texto: ROTULO_STATUS[c.status] || c.status }));
    if (podeEditar() && ["avaliado", "recusado", "erro"].indexOf(c.status) >= 0) {
      var b = el("button", { type: "button", class: "primario", texto: "Fazer corte" });
      b.addEventListener("click", function () {
        b.disabled = true;
        sb.rpc("pedir_corte", { p_clip: c.id }).then(function (r) {
          if (r.error) { b.disabled = false; alert("Não foi possível pedir o corte: " + traduzErro(r.error)); return; }
          c.status = "pedido_corte";
          redesenhar();
        });
      });
      rodape.appendChild(b);
    }
    corpo.appendChild(rodape);
    return el("div", { class: "cartao clip" }, caixa, corpo);
  }

  // ---------- Aprovação ----------
  function abaAprovacao() {
    return Promise.all([
      ler(sb.from("clips").select("*").eq("status", "em_aprovacao").order("atualizado_em", { ascending: false }).limit(50)),
      ler(sb.from("clips").select("*").in("status", ["aprovado", "recusado", "publicado"]).order("decidido_em", { ascending: false, nullsFirst: false }).limit(20))
    ]).then(function (res) {
      var pend = res[0], feitos = res[1];
      var todos = pend.concat(feitos);
      var logins = {};
      todos.forEach(function (c) { if (c.canal) logins[c.canal] = 1; });
      var caminhos = [];
      todos.forEach(function (c) {
        if (c.corte_path) caminhos.push(c.corte_path);
        if (c.capa_path) caminhos.push(c.capa_path);
      });
      var pCanais = Object.keys(logins).length ? ler(sb.from("canais").select("login,nome").in("login", Object.keys(logins))) : Promise.resolve([]);
      var pUrls = caminhos.length ? sb.storage.from("videos").createSignedUrls(caminhos, 3600) : Promise.resolve({ data: [] });
      return Promise.all([pCanais, pUrls]).then(function (r2) {
        var nomes = {};
        r2[0].forEach(function (c) { nomes[c.login] = c.nome || c.login; });
        var urls = {};
        ((r2[1] && r2[1].data) || []).forEach(function (u) { if (u && u.signedUrl && urlSegura(u.signedUrl)) urls[u.path] = u.signedUrl; });

        var wrap = el("div");
        wrap.appendChild(barraTopo("Aprovação"));
        wrap.appendChild(el("div", { class: "msg aviso", texto: "Aprovado não sobe sozinho: escolha quando publicar. O Claude publica no horário escolhido." }));
        wrap.appendChild(el("h3", { class: "sub", texto: "Esperando decisão (" + pend.length + ")" }));
        if (!pend.length) wrap.appendChild(vazio("Nada esperando aprovação", "Peça um corte na aba Clips. Quando o corte ficar pronto, ele aparece aqui."));
        pend.forEach(function (c) { wrap.appendChild(cartaoAprov(c, nomes[c.canal] || c.canal || "—", urls, true)); });
        if (feitos.length) {
          wrap.appendChild(el("h3", { class: "sub", texto: "Decididos recentemente" }));
          feitos.forEach(function (c) { wrap.appendChild(cartaoAprov(c, nomes[c.canal] || c.canal || "—", urls, false)); });
        }
        return wrap;
      });
    });
  }

  function horaCurta(d) {
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " às ");
  }
  function blocoPublicar(c) {
    var caixa = el("div", { class: "publicar" }, el("h4", { class: "rel-sub", texto: "Quando publicar?" }));
    var erroBox = el("div");
    var pode = podeEditar();
    function agendar(quando, btn) {
      if (btn) btn.disabled = true;
      sb.rpc("agendar_publicacao", { p_clip: c.id, p_quando: quando ? quando.toISOString() : null }).then(function (r) {
        if (r.error) { if (btn) btn.disabled = false; limpar(erroBox); erroBox.appendChild(mensagem("erro", traduzErro(r.error))); return; }
        abrirAba("aprovacao");
      });
    }
    if (c.publicar_em) {
      var d = new Date(c.publicar_em);
      var passou = d.getTime() <= Date.now();
      caixa.appendChild(el("p", { class: "agendado", texto: "Agendado para " + horaCurta(d) + " (Brasília)" + (passou ? " · Publicando assim que possível" : "") }));
      if (pode) {
        var bc = el("button", { type: "button", class: "ruim", texto: "Cancelar" });
        bc.addEventListener("click", function () { agendar(null, bc); });
        caixa.appendChild(el("div", { class: "acoes" }, bc));
      }
    } else if (pode) {
      var linha = el("div", { class: "acoes" });
      [["Publicar agora", 0], ["Em 1 h", 1], ["Em 2 h", 2], ["Em 3 h", 3]].forEach(function (par, i) {
        var b = el("button", { type: "button", class: i === 0 ? "primario" : "", texto: par[0] });
        b.addEventListener("click", function () { agendar(new Date(Date.now() + par[1] * 3600000), b); });
        linha.appendChild(b);
      });
      caixa.appendChild(linha);
      var dt = el("input", { type: "datetime-local", "aria-label": "Data e hora para publicar" });
      var bA = el("button", { type: "button", texto: "Agendar" });
      bA.addEventListener("click", function () {
        var q = dt.value ? new Date(dt.value) : null;
        if (!q || isNaN(q)) { limpar(erroBox); erroBox.appendChild(mensagem("aviso", "Escolha a data e a hora.")); return; }
        agendar(q, bA);
      });
      caixa.appendChild(el("div", { class: "acoes" }, dt, bA));
    } else {
      caixa.appendChild(el("p", { class: "suave", texto: "Ainda sem horário escolhido." }));
    }
    caixa.appendChild(erroBox);
    return caixa;
  }

  function cartaoAprov(c, nomeCanal, urls, pendente) {
    var a = c.avaliacao || {};
    var sl = selo(c.nota);
    var caixa = el("div", { class: "aprov-video" });
    var vUrl = c.corte_path ? urls[c.corte_path] : null;
    if (vUrl) {
      var v = el("video", { controls: "controls", preload: "metadata", playsinline: "playsinline", src: vUrl });
      var capa = c.capa_path ? urls[c.capa_path] : null;
      if (capa) v.setAttribute("poster", capa);
      caixa.appendChild(v);
    } else if (!pendente && c.capa_path && urls[c.capa_path]) {
      // decidido: o vídeo sai do hub para economizar espaço e fica só a capa para identificar
      caixa.appendChild(el("img", { src: urls[c.capa_path], alt: "Capa do corte",
        style: "width:100%;max-width:260px;border-radius:10px;display:block" }));
      caixa.appendChild(el("p", { class: "suave", texto: "Vídeo apagado do hub depois da decisão (fica só a capa)." }));
    } else {
      caixa.appendChild(el("p", { class: "suave", texto: "O vídeo do corte ainda não está disponível." }));
    }
    var info = el("div", { class: "aprov-info" },
      el("div", { class: "linha-selos" },
        el("span", { class: "nota num " + sl.cls, texto: c.nota == null ? "—" : String(c.nota) }),
        el("span", { class: "etiqueta st-clip-" + c.status, texto: ROTULO_STATUS[c.status] || c.status }),
        seloTelegram(c)
      ),
      el("p", { class: "suave", texto: "Canal: " + nomeCanal }),
      el("h3", { class: "clip-titulo", texto: a.titulo || c.titulo || "Sem título" }),
      a.descricao ? el("p", { texto: String(a.descricao) }) : null
    );
    var creditos = Array.isArray(a.creditos) ? a.creditos.filter(function (login) {
      return typeof login === "string" && login.trim();
    }) : [];
    if (creditos.length) info.appendChild(el("p", { class: "suave", texto: "Créditos: " + creditos.map(function (login) {
      return "@" + login.trim();
    }).join(", ") }));
    var fontes = Array.isArray(a.fontes) ? a.fontes.filter(function (url) {
      return typeof url === "string" && urlSegura(url);
    }) : [];
    if (fontes.length) {
      var fontesInfo = el("p", { class: "suave" }, "Fontes: ");
      fontes.forEach(function (url, i) {
        if (i) fontesInfo.appendChild(document.createTextNode(" · "));
        fontesInfo.appendChild(link(url));
      });
      info.appendChild(fontesInfo);
    }
    if (!pendente && c.obs) info.appendChild(el("p", { class: "suave", texto: "Observação: " + c.obs }));
    if (!pendente && c.decidido_em) info.appendChild(el("p", { class: "suave", texto: "Decidido em " + dataHora(c.decidido_em) }));

    if (pendente && podeEditar()) {
      var obs = el("textarea", { maxlength: "500", placeholder: "Observação (opcional; útil ao recusar)" });
      var erroBox = el("div");
      var decidir = function (ok, btn) {
        btn.disabled = true;
        sb.rpc("decidir_corte", { p_clip: c.id, p_aprovado: ok, p_obs: obs.value.trim() || null }).then(function (r) {
          if (r.error) { btn.disabled = false; limpar(erroBox); erroBox.appendChild(mensagem("erro", traduzErro(r.error))); return; }
          obs.value = "";
          abrirAba("aprovacao");
        });
      };
      var bOk = el("button", { type: "button", class: "primario", texto: "Aprovar" });
      var bNo = el("button", { type: "button", class: "ruim", texto: "Recusar" });
      bOk.addEventListener("click", function () { decidir(true, bOk); });
      bNo.addEventListener("click", function () { decidir(false, bNo); });
      info.appendChild(obs);
      info.appendChild(erroBox);
      info.appendChild(el("div", { class: "acoes" }, bOk, bNo));
    }
    if (c.status === "aprovado") info.appendChild(blocoPublicar(c));
    if (c.status === "publicado") {
      var ln = c.links || {};
      var pl = el("p", { class: "suave" }, "Publicado: ");
      var tem = false;
      [["yt", "YouTube"], ["tt", "TikTok"]].forEach(function (par) {
        if (ln[par[0]] && urlSegura(ln[par[0]])) {
          if (tem) pl.appendChild(document.createTextNode(" · "));
          pl.appendChild(link(ln[par[0]], par[1])); tem = true;
        }
      });
      if (!tem) pl.appendChild(document.createTextNode("links ainda não registrados"));
      info.appendChild(pl);
    }
    return el("div", { class: "cartao aprov" }, caixa, info);
  }

  // ---------- Relatórios e atualizações ----------
  // Texto puro -> blocos (parágrafo, subtítulo, lista). Tudo com createElement/textContent.
  function textoParaNos(texto) {
    var linhas = String(texto || "").replace(/\r/g, "").split("\n");
    var nos = [], par = [], lista = null, tipoLista = null;
    function fechaPar() {
      if (par.length) { nos.push(el("p", { class: "rel-par", texto: par.join("\n") })); par = []; }
    }
    function fechaLista() { if (lista) { nos.push(lista); lista = null; tipoLista = null; } }
    function proxima(i) {
      for (var k = i + 1; k < linhas.length; k++) if (linhas[k].trim()) return linhas[k].trim();
      return "";
    }
    var reLista = /^(- |\d+\. )/;
    linhas.forEach(function (bruta, i) {
      var l = bruta.trim();
      if (!l) { fechaPar(); fechaLista(); return; }
      var ul = l.indexOf("- ") === 0, ol = /^\d+\. /.test(l);
      if (ul || ol) {
        fechaPar();
        var t = ul ? "ul" : "ol";
        if (tipoLista !== t) { fechaLista(); lista = el(t, { class: "rel-lista" }); tipoLista = t; }
        lista.appendChild(el("li", { texto: l.replace(/^(- |\d+\. )/, "") }));
        return;
      }
      fechaLista();
      if (l.length <= 60 && !/[.!?;]$/.test(l) && reLista.test(proxima(i)) && !par.length) {
        nos.push(el("h4", { class: "rel-sub", texto: l.replace(/:$/, "") }));
        return;
      }
      par.push(l);
    });
    fechaPar(); fechaLista();
    return nos;
  }
  function blocoTexto(texto) {
    var d = el("div", { class: "rel-texto" });
    textoParaNos(texto).forEach(function (n) { d.appendChild(n); });
    return d;
  }

  function abaRelatorios() {
    return ler(sb.from("relatorios").select("*").limit(500)).then(function (itens) {
      var wrap = el("div");
      wrap.appendChild(barraTopo("RELATÓRIOS E ATUALIZAÇÕES"));
      function de(tipo) { return itens.filter(function (x) { return x.tipo === tipo; }); }
      function porData(a, b) { return String(b.data || "").localeCompare(String(a.data || "")); }

      var guia = de("guia").sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
      var cg = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Como funciona" })));
      guia.forEach(function (g) {
        cg.appendChild(el("div", { class: "item" }, el("h3", { texto: g.titulo }), blocoTexto(g.conteudo)));
      });
      if (!guia.length) cg.appendChild(el("p", { class: "suave", texto: "O guia ainda não foi enviado." }));
      wrap.appendChild(cg);

      var vers = de("versao").sort(function (a, b) { return (b.ordem || 0) - (a.ordem || 0); });
      var cv = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Versões e mudanças" })));
      vers.forEach(function (v) {
        cv.appendChild(el("div", { class: "item" },
          el("div", { class: "linha-selos" },
            v.versao ? el("span", { class: "etiqueta n80 num", texto: "v" + String(v.versao).replace(/^v/i, "") }) : null,
            el("span", { class: "quando", texto: v.data ? dataCurta(v.data) : "" })
          ),
          el("h3", { texto: v.titulo }), blocoTexto(v.conteudo)));
      });
      if (!vers.length) cv.appendChild(el("p", { class: "suave", texto: "Nenhuma versão registrada ainda." }));
      wrap.appendChild(cv);

      var rels = de("relatorio").sort(porData);
      var cr = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Relatórios" })));
      rels.forEach(function (r, i) {
        var det = el("details", { class: "rel-det" },
          el("summary", null,
            el("span", { class: "quando num", texto: r.data ? dataCurta(r.data) : "" }), " ",
            el("strong", { texto: r.titulo })),
          blocoTexto(r.conteudo));
        if (i === 0) det.open = true;
        cr.appendChild(det);
      });
      if (!rels.length) cr.appendChild(el("p", { class: "suave", texto: "Nenhum relatório ainda. Eles aparecem aqui depois do sync." }));
      wrap.appendChild(cr);
      return wrap;
    });
  }

  // ---------- Hub de contas (nossas contas) ----------
  function abaContas() {
    return ler(sb.from("contas").select("*").order("plataforma", { ascending: true })).then(function (contas) {
      var tab = el("table", null, el("thead", null, el("tr", null,
        el("th", { texto: "Rede" }), el("th", { texto: "Nome" }), el("th", { texto: "Arroba" }), el("th", { texto: "Link" }), el("th", { texto: "Status" })
      )));
      var tb = el("tbody");
      contas.forEach(function (c) {
        tb.appendChild(el("tr", null,
          el("td", { texto: nomePlataforma(c.plataforma) }), el("td", { texto: c.nome || "—" }), el("td", { texto: c.arroba || "—" }),
          el("td", null, link(c.link, "Abrir")), el("td", { texto: c.status || "—" })
        ));
      });
      tab.appendChild(tb);
      return el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Hub de contas" })),
        el("div", { class: "tabela-rolavel" }, tab));
    });
  }

  // ---------- início ----------
  btnSair.addEventListener("click", sair);

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { telaSemConfig(); return; }
  if (!window.supabase || !window.supabase.createClient) {
    limpar(app);
    app.appendChild(mensagem("erro", "Não foi possível carregar a biblioteca de login. Verifique a internet."));
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // O link do e-mail de recuperação dispara PASSWORD_RECOVERY.
  sb.auth.onAuthStateChange(function (evento, sessao) {
    if (evento === "PASSWORD_RECOVERY") {
      emRecuperacao = true;
      setTimeout(telaNovaSenha, 0);
    } else if (evento === "SIGNED_OUT") {
      setTimeout(function () { if (!emRecuperacao) telaEntrar(); }, 0);
    }
  });

  sb.auth.getSession().then(function (r) {
    if (emRecuperacao) return;
    if (r.data && r.data.session) iniciarApp();
    else telaEntrar();
  });
})();
