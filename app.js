/* Central de Deudores — consulta de CUIT/CUIL/CDI contra la API pública del BCRA.
 *
 * API (sin autenticación):
 *   GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cuit}
 *   GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/{cuit}
 *
 * La consulta se hace directo desde el navegador: no hay backend, no se guarda nada.
 */
(function () {
  "use strict";

  var API = "https://api.bcra.gob.ar/centraldedeudores/v1.0";
  var BANKS_URL = "https://api.bcra.gob.ar/cheques/v1.0/entidades";
  var TIMEOUT_MS = 25000;

  var SITUACIONES = {
    0: { code: 0, short: "Sin clasificar", title: "Sin clasificar" },
    1: { code: 1, short: "Normal", title: "Situación 1 · Normal" },
    2: { code: 2, short: "Riesgo bajo", title: "Situación 2 · Riesgo bajo" },
    3: { code: 3, short: "Riesgo medio", title: "Situación 3 · Riesgo medio" },
    4: { code: 4, short: "Riesgo alto", title: "Situación 4 · Riesgo alto" },
    5: { code: 5, short: "Irrecuperable", title: "Situación 5 · Irrecuperable" },
    6: { code: 6, short: "Disposición técnica", title: "Situación 6 · Irrecuperable por disposición técnica" }
  };

  /* Nombres de entidades para los cheques rechazados (la API devuelve el código).
     Se actualizan solos con el endpoint /cheques/v1.0/entidades cuando está disponible. */
  var BANK_NAMES = {
    5: "The Royal Bank of Scotland N.V.",
    7: "Banco de Galicia y Buenos Aires S.A.",
    11: "Banco de la Nación Argentina",
    14: "Banco de la Provincia de Buenos Aires",
    15: "Industrial and Commercial Bank of China",
    16: "Citibank N.A.",
    17: "Banco BBVA Argentina S.A.",
    18: "MUFG Bank, Ltd.",
    20: "Banco de la Provincia de Córdoba S.A.",
    27: "Banco Supervielle S.A.",
    29: "Banco de la Ciudad de Buenos Aires",
    34: "Banco Patagonia S.A.",
    44: "Banco Hipotecario S.A.",
    45: "Banco de San Juan S.A.",
    60: "Banco del Tucumán S.A.",
    65: "Banco Municipal de Rosario",
    72: "Banco Santander Argentina S.A.",
    79: "Banco Regional de Cuyo S.A.",
    83: "Banco del Chubut S.A.",
    86: "Banco de Santa Cruz S.A.",
    93: "La Pampa S.A.",
    94: "Banco de Corrientes S.A.",
    97: "Banco Provincia del Neuquén S.A.",
    147: "Bibank S.A.",
    150: "Banco GGAL S.A.",
    191: "Banco Credicoop Coop. Ltdo.",
    198: "Banco de Valores S.A.",
    247: "Banco Roela S.A.",
    254: "Banco Mariva S.A.",
    259: "Banco BMA S.A.U.",
    266: "BNP Paribas",
    268: "Banco Provincia de Tierra del Fuego",
    277: "Banco Saenz S.A.",
    281: "Banco Meridian S.A.",
    285: "Banco Macro S.A.",
    297: "Banco Banex S.A.",
    299: "Banco Comafi S.A.",
    301: "Banco Piano S.A.",
    303: "Banco Finansur S.A.",
    305: "Banco Julio S.A.",
    306: "Banco Privado de Inversiones S.A.",
    309: "Banco Rioja S.A.U.",
    310: "Banco del Sol S.A.",
    311: "Nuevo Banco del Chaco S.A.",
    315: "Banco de Formosa S.A.",
    319: "Banco CMF S.A.",
    321: "Banco de Santiago del Estero S.A.",
    322: "Banco Industrial",
    330: "Nuevo Banco de Santa Fe S.A.",
    336: "Banco Bradesco Argentina S.A.U.",
    338: "Banco de Servicios y Transacciones S.A.U.",
    341: "Banco Masventas S.A.",
    386: "Nuevo Banco de Entre Ríos S.A.",
    389: "Banco Columbia S.A.",
    426: "Banco Bica S.A.",
    431: "Banco Coinag S.A.",
    432: "Banco de Comercio S.A.",
    435: "Banco Sucrédito Regional S.A.U.",
    448: "Banco Dino S.A."
  };

  var form = document.getElementById("searchForm");
  var input = document.getElementById("cuit");
  var button = document.getElementById("submitBtn");
  var hint = document.getElementById("hint");
  var result = document.getElementById("result");
  var empty = document.getElementById("empty");

  var controller = null;
  var requestId = 0;
  var currentCuit = "";
  var banksRequested = false;

  /* ---------- utilidades ---------- */

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function digits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function maskCuit(value) {
    var d = digits(value).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 10) return d.slice(0, 2) + "-" + d.slice(2);
    return d.slice(0, 2) + "-" + d.slice(2, 10) + "-" + d.slice(10);
  }

  function fmtMoney(n) {
    var value = typeof n === "number" ? n : Number(n);
    if (!isFinite(value)) return "—";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(value);
  }

  function fmtInt(n) {
    var value = Number(n);
    if (!isFinite(value)) return "—";
    return new Intl.NumberFormat("es-AR").format(Math.round(value));
  }

  function fmtDate(iso) {
    if (!iso || typeof iso !== "string") return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return "—";
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function fmtPeriod(periodo) {
    var p = String(periodo || "");
    if (/^\d{6}$/.test(p)) return p.slice(4, 6) + "/" + p.slice(0, 4);
    return p || "—";
  }

  function sit(n) {
    var code = Number(n);
    return SITUACIONES[code] || SITUACIONES[0];
  }

  function setHint(text, isError) {
    hint.textContent = text;
    hint.classList.toggle("is-error", !!isError);
  }

  /* ---------- pedidos a la API ---------- */

  function request(url, signal) {
    return fetch(url, {
      signal: signal,
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (err) { /* respuesta no JSON */ }
        return { status: res.status, ok: res.ok, data: data };
      });
    });
  }

  function classify(outcome) {
    if (!outcome) return { kind: "network", detail: "Sin respuesta del servicio." };
    if (outcome.error) return { kind: "network", detail: outcome.error };
    if (outcome.status === 404) return { kind: "empty" };
    if (outcome.status === 400) return { kind: "bad", detail: "El BCRA rechazó el número ingresado." };
    if (outcome.status === 429) return { kind: "http", status: 429, detail: "Demasiadas consultas en poco tiempo." };
    if (outcome.status >= 500) return { kind: "http", status: outcome.status, detail: "El servicio del BCRA no está disponible." };
    if (outcome.status !== 200) return { kind: "http", status: outcome.status, detail: "Respuesta inesperada del BCRA." };
    if (!outcome.data || typeof outcome.data !== "object") {
      return { kind: "http", status: 200, detail: "El BCRA devolvió una respuesta vacía." };
    }
    return { kind: "ok", data: outcome.data };
  }

  function search(cuit) {
    var id = ++requestId;
    currentCuit = cuit;

    if (controller) controller.abort();
    controller = new AbortController();
    var signal = controller.signal;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; controller.abort(); }, TIMEOUT_MS);

    result.hidden = false;
    empty.hidden = true;
    button.disabled = true;
    setHint("Consultando al BCRA…");
    input.removeAttribute("aria-invalid");
    renderLoading();

    if (!banksRequested) {
      banksRequested = true;
      loadBanks();
    }

    function one(url) {
      return request(url, signal).catch(function (err) {
        return {
          error: err && err.name === "AbortError"
            ? (timedOut ? "La consulta tardó demasiado." : "Consulta cancelada.")
            : "No se pudo conectar con la API del BCRA."
        };
      });
    }

    Promise.all([
      one(API + "/Deudas/" + cuit),
      one(API + "/Deudas/ChequesRechazados/" + cuit)
    ]).then(function (outcomes) {
      clearTimeout(timer);
      if (id !== requestId) return;

      button.disabled = false;

      if (signal.aborted && !timedOut) return;

      var deudas = classify(outcomes[0]);
      var cheques = classify(outcomes[1]);

      if (deudas.kind === "network" && cheques.kind === "network") {
        setHint("No se pudo conectar con el BCRA.", true);
        renderConnectionError(deudas.detail || cheques.detail);
        return;
      }

      if (deudas.kind === "empty" && cheques.kind === "empty") {
        setHint("");
        renderNotFound(cuit);
        return;
      }

      if (deudas.kind === "bad" && cheques.kind === "bad") {
        setHint("Revisá el número ingresado.", true);
        renderNotFound(cuit, "El BCRA no reconoció el CUIT/CUIL/CDI. Verificá que tenga 11 dígitos.");
        return;
      }

      setHint("");
      renderResult(cuit, deudas, cheques);
    });
  }

  function loadBanks() {
    request(BANKS_URL, null).then(function (res) {
      if (res.ok && res.data && Array.isArray(res.data.results)) {
        res.data.results.forEach(function (bank) {
          if (bank && bank.codigoEntidad !== null && bank.denominacion) {
            BANK_NAMES[bank.codigoEntidad] = bank.denominacion;
          }
        });
        document.querySelectorAll("[data-bank]").forEach(function (node) {
          node.textContent = bankName(Number(node.dataset.bank));
        });
      }
    }).catch(function () { /* se mantiene la lista local */ });
  }

  function bankName(code) {
    if (typeof code === "string" && !/^\d+$/.test(code)) return code;
    return BANK_NAMES[code] || ("Entidad " + code);
  }

  /* ---------- estados de la página ---------- */

  function resetResult() {
    result.innerHTML = "";
    result.hidden = true;
    empty.hidden = false;
    document.title = "Central de Deudores · Consulta de CUIT";
  }

  function renderLoading() {
    result.innerHTML = "";
    var card = h("div", { class: "card loading-card", "aria-busy": "true" },
      h("div", { class: "skel-head" },
        h("div", { style: "flex:1" },
          h("div", { class: "skel tall w70" }),
          h("div", { class: "skel w40" })
        ),
        h("div", { class: "skel", style: "width:120px;height:28px;border-radius:999px" })
      ),
      h("div", { class: "skel w90", style: "margin-top:22px" }),
      h("div", { class: "skel w70" })
    );
    result.appendChild(card);
    setBusy(true);
    focusResult(card);
  }

  function setBusy(busy) {
    button.disabled = busy;
    if (busy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function focusResult(node) {
    node.setAttribute("tabindex", "-1");
    try { node.focus({ preventScroll: true }); } catch (err) { /* navegadores viejos */ }
    var rect = node.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
      try { node.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (err) { node.scrollIntoView(); }
    }
  }

  function messageCard(kind, title, text, extra) {
    var icon = kind === "error"
      ? h("span", { class: "ico", "aria-hidden": "true" }, warningIcon())
      : h("span", { class: "ico", "aria-hidden": "true" }, infoIcon());

    var body = h("div", null,
      h("h2", { text: title }),
      h("p", { text: text })
    );

    if (extra) body.appendChild(extra);

    return h("div", { class: "card" },
      h("div", { class: "message " + kind }, icon, body)
    );
  }

  function renderConnectionError(detail) {
    document.title = "Central de Deudores · Consulta de CUIT";
    var retry = h("div", { class: "actions" },
      h("button", {
        class: "btn-ghost",
        type: "button",
        onclick: function () { if (currentCuit) search(currentCuit); }
      }, "Reintentar")
    );

    var tech = h("details", { class: "tech" },
      h("summary", { text: "Detalle técnico" }),
      h("code", { text: detail || "Error de red" })
    );

    result.innerHTML = "";
    result.appendChild(messageCard(
      "error",
      "No pudimos consultar al BCRA",
      "La API oficial no respondió desde tu navegador. Revisá tu conexión a internet y volvé a intentar en unos segundos. Si el problema persiste, puede ser una restricción temporal del servicio.",
      h("div", null, retry, tech)
    ));
    setBusy(false);
    focusResult(result.firstChild);
  }

  function renderNotFound(cuit, customText) {
    document.title = "Central de Deudores · Consulta de CUIT";
    result.innerHTML = "";
    result.appendChild(messageCard(
      "empty",
      "Sin registros para este CUIT",
      customText || "El BCRA no devolvió información para " + maskCuit(cuit) + ". Puede que el número no exista o que no tenga deudas ni cheques rechazados informados.",
      h("div", { class: "actions" },
        h("button", {
          class: "btn-ghost",
          type: "button",
          onclick: function () { resetResult(); input.focus(); input.select(); }
        }, "Hacer otra consulta")
      )
    ));
    setBusy(false);
    focusResult(result.firstChild);
  }

  /* ---------- resultado ---------- */

  function renderResult(cuit, deudas, cheques) {
    var latest = deudas.kind === "ok" ? latestPeriod(deudas.data) : null;
    var entities = latest ? (latest.entidades || []) : [];

    var allCheques = [];
    var causales = cheques.kind === "ok" ? ((cheques.data.results && cheques.data.results.causales) || []) : [];
    causales.forEach(function (causal) {
      (causal.entidades || []).forEach(function (ent) {
        (ent.detalle || []).forEach(function (det) {
          allCheques.push({ causal: causal.causal, entidad: ent.entidad, detalle: det });
        });
      });
    });

    var denominacion = "";
    if (deudas.kind === "ok" && deudas.data.results && deudas.data.results.denominacion) {
      denominacion = deudas.data.results.denominacion;
    } else if (cheques.kind === "ok" && cheques.data.results && cheques.data.results.denominacion) {
      denominacion = cheques.data.results.denominacion;
    }

    var total = entities.reduce(function (acc, e) { return acc + (Number(e.monto) || 0); }, 0);
    var worst = entities.reduce(function (acc, e) {
      var s = Number(e.situacion) || 0;
      return s > acc ? s : acc;
    }, 0);

    var pendientes = allCheques.filter(function (c) { return !c.detalle.fechaPago; }).length;

    var card = h("div", { class: "card" });

    /* cabecera */
    var badge;
    if (deudas.kind === "ok" && entities.length) {
      badge = h("span", { class: "badge b" + sit(worst).code },
        h("span", { class: "dot" }), sit(worst).title);
    } else if (deudas.kind === "ok" || deudas.kind === "empty") {
      badge = h("span", { class: "badge b1" }, h("span", { class: "dot" }), "Sin deudas");
    } else {
      badge = h("span", { class: "badge" }, h("span", { class: "dot" }), "Consulta parcial");
    }

    card.appendChild(h("header", { class: "identity" },
      h("div", null,
        h("p", { class: "eyebrow", text: "Informe" }),
        h("h2", { text: denominacion || "Denominación no informada" }),
        h("p", { class: "meta", text: maskCuit(cuit) })
      ),
      badge
    ));

    /* métricas */
    var deudaValue, deudaNote;
    if (deudas.kind === "ok") {
      deudaValue = entities.length ? fmtMoney(total) : "—";
      deudaNote = entities.length
        ? "Período " + fmtPeriod(latest.periodo)
        : "Sin deudas informadas";
    } else {
      deudaValue = "—";
      deudaNote = "No se pudo consultar";
    }

    var chequeNote = allCheques.length
      ? (pendientes ? fmtInt(pendientes) + " sin regularizar" : "Todos regularizados")
      : "Sin registros";

    card.appendChild(h("div", { class: "stats" },
      h("div", { class: "stat" },
        h("p", { class: "label", text: "Deuda informada" }),
        h("p", { class: "value", text: deudaValue }),
        h("p", { class: "note", text: deudaNote })
      ),
      h("div", { class: "stat" },
        h("p", { class: "label", text: "Entidades" }),
        h("p", { class: "value", text: entities.length ? fmtInt(entities.length) : "—" }),
        h("p", { class: "note", text: entities.length ? "con financiaciones" : "—" })
      ),
      h("div", { class: "stat" },
        h("p", { class: "label", text: "Cheques rechazados" }),
        h("p", { class: "value", text: allCheques.length ? fmtInt(allCheques.length) : "—" }),
        h("p", { class: "note", text: chequeNote })
      )
    ));

    card.appendChild(deudasPanel(deudas, latest, entities));
    card.appendChild(chequesPanel(cheques, causales, allCheques));
    card.appendChild(legendPanel());

    result.innerHTML = "";
    result.appendChild(card);
    setBusy(false);
    focusResult(card);
    document.title = (denominacion ? denominacion + " · " : "") + "Central de Deudores";
  }

  function latestPeriod(data) {
    var periodos = (data && data.results && data.results.periodos) || [];
    return periodos.slice().sort(function (a, b) {
      return String(b.periodo).localeCompare(String(a.periodo));
    })[0] || null;
  }

  function panelHead(title, note, count) {
    return h("div", { class: "panel-head" },
      h("h3", null, title, count !== undefined ? h("span", { class: "count", style: "margin-left:8px", text: fmtInt(count) }) : null),
      note ? h("span", { class: "note", text: note }) : null
    );
  }

  function deudasPanel(deudas, latest, entities) {
    var panel = h("section", { class: "panel" });

    panel.appendChild(panelHead("Deudas", latest ? "Período " + fmtPeriod(latest.periodo) : null));

    if (deudas.kind === "network" || deudas.kind === "http" || deudas.kind === "bad") {
      panel.appendChild(cleanBox("No se pudo consultar la sección de deudas. " + (deudas.detail || ""), true));
      return panel;
    }

    if (deudas.kind === "empty" || !entities.length) {
      panel.appendChild(cleanBox("El BCRA no informó deudas para este CUIT en el último período."));
      return panel;
    }

    var rows = entities.map(function (e) {
      var flags = [];
      if (e.refinanciaciones) flags.push("Refinanciación");
      if (e.recategorizacionOblig) flags.push("Recategorización obligatoria");
      if (e.situacionJuridica) flags.push("Situación jurídica");
      if (e.irrecDisposicionTecnica) flags.push("Disposición técnica");
      if (e.enRevision) flags.push("En revisión");
      if (e.procesoJud) flags.push("Proceso judicial");

      var entityCell = h("div", null,
        h("span", { class: "entity", text: e.entidad || "Entidad sin nombre" })
      );
      if (flags.length) {
        entityCell.appendChild(h("div", { class: "tags" }, flags.map(function (f) {
          return h("span", { class: "tag", text: f });
        })));
      }

      return [
        entityCell,
        sitPill(e.situacion),
        h("span", { class: "tnum", text: fmtMoney(e.monto) }),
        h("span", { class: "tnum", text: e.diasAtrasoPago !== null && e.diasAtrasoPago !== undefined ? fmtInt(e.diasAtrasoPago) : "—" })
      ];
    });

    panel.appendChild(makeTable([
      { label: "Entidad" },
      { label: "Situación" },
      { label: "Monto", num: true },
      { label: "Días de atraso", num: true }
    ], rows));

    panel.appendChild(h("p", { class: "panel-foot" },
      "Montos en pesos argentinos informados por cada entidad. La situación corresponde a la última clasificación remitida."
    ));

    return panel;
  }

  function chequesPanel(cheques, causales, allCheques) {
    var panel = h("section", { class: "panel" });
    panel.appendChild(panelHead("Cheques rechazados", null, allCheques.length ? allCheques.length : undefined));

    if (cheques.kind === "network" || cheques.kind === "http" || cheques.kind === "bad") {
      panel.appendChild(cleanBox("No se pudo consultar la sección de cheques rechazados. " + (cheques.detail || ""), true));
      return panel;
    }

    if (!allCheques.length) {
      panel.appendChild(cleanBox("No se informaron cheques rechazados para este CUIT."));
      return panel;
    }

    causales.forEach(function (causal) {
      var items = [];
      (causal.entidades || []).forEach(function (ent) {
        (ent.detalle || []).forEach(function (det) {
          items.push({ entidad: ent.entidad, detalle: det });
        });
      });
      if (!items.length) return;

      var block = h("div", { class: "causal" },
        h("div", { class: "causal-head" },
          h("h4", { text: causal.causal || "Sin causal informada" }),
          h("span", { text: fmtInt(items.length) + (items.length === 1 ? " cheque" : " cheques") })
        )
      );

      block.appendChild(makeTable([
        { label: "Entidad" },
        { label: "Nº de cheque", num: true },
        { label: "Monto", num: true },
        { label: "Rechazo" },
        { label: "Estado" }
      ], items.map(function (item) {
        var det = item.detalle;
        var entityCell = h("div", null,
          h("span", { class: "entity", "data-bank": String(item.entidad), text: bankName(item.entidad) })
        );
        if (det.denomJuridica) {
          entityCell.appendChild(h("div", { class: "tags" },
            h("span", { class: "tag", text: det.denomJuridica })
          ));
        }

        var extra = [];
        if (det.enRevision) extra.push("En revisión");
        if (det.procesoJud) extra.push("Proceso judicial");
        if (extra.length) {
          entityCell.appendChild(h("div", { class: "tags" }, extra.map(function (t) {
            return h("span", { class: "tag", text: t });
          })));
        }

        return [
          entityCell,
          h("span", { class: "tnum", text: det.nroCheque !== null && det.nroCheque !== undefined ? String(det.nroCheque) : "—" }),
          h("span", { class: "tnum", text: fmtMoney(det.monto) }),
          h("span", { class: "nowrap", text: fmtDate(det.fechaRechazo) }),
          estadoCheque(det)
        ];
      })));

      panel.appendChild(block);
    });

    panel.appendChild(h("p", { class: "panel-foot" },
      "Cheques rechazados informados por las entidades. Un cheque con fecha de levantamiento puede seguir apareciendo en el listado."
    ));

    return panel;
  }

  function estadoCheque(det) {
    if (det.fechaPago) {
      return h("span", { class: "tag", title: "Cheque levantado", text: "Levantado " + fmtDate(det.fechaPago) });
    }
    if (det.fechaPagoMulta) {
      return h("span", { class: "tag", title: "Multa pagada", text: "Multa pagada" });
    }
    var estado = (det.estadoMulta || "").toString().toUpperCase();
    if (estado === "IMPAGA") {
      return h("span", { class: "tag", style: "color:#b42318;border-color:#f3c9c5;background:#fdf1f0", text: "Multa impaga" });
    }
    if (estado === "SUSPENDIDO" || estado === "SUSPENDIDA") {
      return h("span", { class: "tag", text: "Multa suspendida" });
    }
    if (estado) {
      return h("span", { class: "tag", text: "Multa " + estado.toLowerCase() });
    }
    return h("span", { class: "muted", text: "—" });
  }

  function cleanBox(text, warn) {
    return h("div", { class: "clean" + (warn ? " warn" : "") },
      h("span", { "aria-hidden": "true" }, warn ? warningIcon() : checkIcon()),
      h("span", { text: text })
    );
  }

  function legendPanel() {
    var details = h("details", { class: "legend in-card" },
      h("summary", { text: "Qué significa cada situación" }),
      h("dl", null, [1, 2, 3, 4, 5, 6].map(function (n) {
        var descriptions = {
          1: "Cumplimiento normal de las obligaciones.",
          2: "Atrasos ocasionales y debilidades potenciales.",
          3: "Dificultades que requieren seguimiento.",
          4: "Alto riesgo de insolvencia.",
          5: "Deuda considerada de difícil o imposible recupero.",
          6: "Irrecuperable por disposición técnica (concurso o quiebra)."
        };
        return h("div", null,
          h("dt", null, h("span", { class: "dot s" + n }), n + " · " + sit(n).short),
          h("dd", { text: descriptions[n] })
        );
      }))
    );
    return details;
  }

  /* ---------- tabla y piezas ---------- */

  function makeTable(cols, rows) {
    var headRow = h("tr", null, cols.map(function (col) {
      return h("th", { scope: "col", class: col.num ? "num" : null, text: col.label });
    }));

    var tbody = h("tbody", null, rows.map(function (cells) {
      return h("tr", null, cells.map(function (cell, i) {
        return h("td", {
          class: cols[i] && cols[i].num ? "num" : null,
          "data-label": cols[i] ? cols[i].label : null
        }, cell);
      }));
    }));

    return h("div", { class: "table-scroll" },
      h("table", null, h("thead", null, headRow), tbody)
    );
  }

  function sitPill(value) {
    var meta = sit(value);
    return h("span", { class: "pill p" + meta.code },
      h("span", { class: "dot" }),
      meta.short
    );
  }

  function checkIcon() {
    return svgIcon("M20 6 9 17l-5-5");
  }

  function warningIcon() {
    return svgIcon("M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z");
  }

  function infoIcon() {
    return svgIcon("M12 16v-5m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z");
  }

  function svgIcon(path) {
    var ns = "http://www.w3.org/2000/svg";
    var el = document.createElementNS(ns, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("width", "18");
    el.setAttribute("height", "18");
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    el.appendChild(p);
    return el;
  }

  /* ---------- eventos ---------- */

  input.addEventListener("input", function () {
    var raw = input.value;
    var caret = input.selectionStart || 0;
    var digitsBefore = digits(raw.slice(0, caret)).length;
    var masked = maskCuit(raw);
    input.value = masked;

    var index = 0;
    var seen = 0;
    while (index < masked.length && seen < digitsBefore) {
      if (/\d/.test(masked.charAt(index))) seen++;
      index++;
    }
    try { input.setSelectionRange(index, index); } catch (err) { /* input sin selección */ }
    if (input.getAttribute("aria-invalid") === "true" && digits(masked).length === 11) {
      input.removeAttribute("aria-invalid");
      setHint("Ingresá 11 dígitos. Podés consultar por CUIT, CUIL o CDI.");
    }
  });

  input.addEventListener("blur", function () {
    input.value = maskCuit(input.value);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var cuit = digits(input.value);

    if (cuit.length !== 11) {
      input.setAttribute("aria-invalid", "true");
      setHint(cuit.length === 0
        ? "Ingresá un CUIT, CUIL o CDI."
        : "El número debe tener 11 dígitos (ingresaste " + cuit.length + ").", true);
      input.focus();
      return;
    }

    input.value = maskCuit(cuit);
    var url = new URL(window.location.href);
    url.searchParams.set("cuit", cuit);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    search(cuit);
  });

  /* ---------- inicio ---------- */

  (function init() {
    var fromUrl = digits(new URLSearchParams(window.location.search).get("cuit"));
    if (fromUrl.length === 11) {
      input.value = maskCuit(fromUrl);
      search(fromUrl);
    } else {
      input.focus();
    }
  })();
})();
