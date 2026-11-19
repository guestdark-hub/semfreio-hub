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
    return { youtube: "YouTube", tiktok: "TikTok", kwai: "Kwai" }[p] || p || "—";
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
    }).catch(function (e) {
      cartaoLogin("Erro", [mensagem("erro", traduzErro(e)), el("button", { type: "button", texto: "Sair", onclick: sair })]);
    });
  }

  function sair() {
    sb.auth.signOut().then(function () { papel = null; telaEntrar(); });
  }

  var abas = [
    { id: "painel", nome: "Painel", fn: abaPainel },
    { id: "videos", nome: "Vídeos", fn: abaVideos },
    { id: "qg", nome: "QG", fn: abaQG },
    { id: "contas", nome: "Contas", fn: abaContas }
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

  function abrirAba(id) {
    abaAtual = id;
    Array.prototype.forEach.call(app.querySelectorAll("nav.abas button"), function (b) {
      b.classList.toggle("ativa", b.getAttribute("data-aba") === id);
    });
    var corpo = document.getElementById("corpo");
    limpar(corpo);
    corpo.appendChild(el("p", { class: "suave", texto: "Carregando..." }));
    var aba = abas.filter(function (a) { return a.id === id; })[0];
    aba.fn().then(function (no) {
      if (abaAtual !== id) return;
      limpar(corpo);
      corpo.appendChild(no);
    }).catch(function (e) {
      limpar(corpo);
      corpo.appendChild(mensagem("erro", "Não deu para carregar: " + traduzErro(e)));
    });
  }

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
      var views = {};
      res[1].forEach(function (m) { views[m.video_id] = m.views; });
      var cart = el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Vídeos postados" })));
      var aviso2 = el("div");
      cart.appendChild(aviso2);
      var tab = el("table", null, el("thead", null, el("tr", null,
        el("th", { texto: "Título" }), el("th", { texto: "Streamer" }), el("th", { texto: "Rede" }),
        el("th", { texto: "Data" }), el("th", { texto: "Link" }), el("th", { class: "n", texto: "Views" }), el("th", { texto: "" })
      )));
      var tb = el("tbody");
      res[0].forEach(function (v) {
        var btn = el("button", { type: "button", texto: "Baixar" });
        btn.addEventListener("click", function () { baixar(v, btn, aviso2); });
        if (!v.arquivo_path) btn.disabled = true;
        tb.appendChild(el("tr", null,
          el("td", { texto: v.titulo || v.id }), el("td", { texto: v.streamer || "—" }), el("td", { texto: nomePlataforma(v.plataforma) }),
          el("td", { texto: dataCurta(v.data) }), el("td", null, link(v.link, "Abrir")),
          el("td", { class: "n", texto: num(views[v.id]) }), el("td", null, btn)
        ));
      });
      if (!res[0].length) tb.appendChild(el("tr", null, el("td", { colspan: "7", texto: "Nenhum vídeo ainda." })));
      tab.appendChild(tb);
      cart.appendChild(el("div", { class: "tabela-rolavel" }, tab));
      return cart;
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

  // ---------- Contas ----------
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
      return el("div", { class: "cartao" }, el("h2", null, el("span", { class: "titulo", texto: "Contas" })),
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
