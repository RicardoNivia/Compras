
(function(){
  "use strict";

  /* ================= Festivos Colombia ================= */
  var FESTIVOS_2026 = [
    "2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03","2026-05-01",
    "2026-05-18","2026-06-08","2026-06-15","2026-06-29","2026-07-13","2026-07-20",
    "2026-08-07","2026-08-17","2026-10-12","2026-11-02","2026-11-16","2026-12-08","2026-12-25"
  ];
  var holidayCache = {};
  function nextMonday(d){
    var wd = d.getDay(); // 0 sun .. 6 sat
    var add = (wd === 1) ? 0 : ((8 - wd) % 7 || 7);
    if (wd === 1) return new Date(d);
    var nd = new Date(d);
    nd.setDate(nd.getDate() + add);
    return nd;
  }
  function easterSunday(year){
    // Meeus/Jones/Butcher algorithm
    var a = year % 19, b = Math.floor(year/100), c = year % 100;
    var d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
    var g = Math.floor((b-f+1)/3), h = (19*a + b - d - g + 15) % 30;
    var i = Math.floor(c/4), k = c % 4;
    var l = (32 + 2*e + 2*i - h - k) % 7;
    var m = Math.floor((a + 11*h + 22*l)/451);
    var month = Math.floor((h + l - 7*m + 114)/31);
    var day = ((h + l - 7*m + 114) % 31) + 1;
    return new Date(year, month-1, day);
  }
  function fmtISO(d){
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function computeHolidaysForYear(year){
    if (year === 2026) return FESTIVOS_2026.slice();
    if (holidayCache[year]) return holidayCache[year];
    var list = [];
    function add(d){ list.push(fmtISO(d)); }
    add(new Date(year,0,1));
    add(nextMonday(new Date(year,0,6)));
    add(nextMonday(new Date(year,2,19)));
    var easter = easterSunday(year);
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()-3));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()-2));
    add(new Date(year,4,1));
    add(nextMonday(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()+39)));
    add(nextMonday(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()+60)));
    add(nextMonday(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()+68)));
    add(nextMonday(new Date(year,5,29)));
    add(new Date(year,6,20));
    add(new Date(year,7,7));
    add(nextMonday(new Date(year,7,15)));
    add(nextMonday(new Date(year,9,12)));
    add(nextMonday(new Date(year,10,1)));
    add(nextMonday(new Date(year,10,11)));
    add(new Date(year,11,8));
    add(new Date(year,11,25));
    holidayCache[year] = list;
    return list;
  }
  var holidaySets = {};
  function isHoliday(dateObj){
    var y = dateObj.getFullYear();
    if (!holidaySets[y]) holidaySets[y] = new Set(computeHolidaysForYear(y));
    return holidaySets[y].has(fmtISO(dateObj));
  }
  function parseISODate(s){
    if (!s) return null;
    var parts = s.split("-");
    return new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
  }
  function businessDaysBetween(startISO, endISO){
    var start = parseISODate(startISO), end = parseISODate(endISO);
    if (!start || !end) return null;
    if (end < start) return null;
    var count = 0;
    var d = new Date(start);
    while (d < end){
      d.setDate(d.getDate()+1);
      var wd = d.getDay();
      if (wd !== 0 && wd !== 6 && !isHoliday(d)) count++;
    }
    return count;
  }
  function businessDaysElapsedToToday(startISO){
    var todayISO = fmtISO(new Date());
    return businessDaysBetween(startISO, todayISO);
  }

  /* ================= State ================= */
  // Los registros ya no vienen embebidos en un <script id="app-data">:
  // se consultan en SQLite (via Prisma) en el servidor y llegan aquí
  // como window.__INITIAL_STATE__ (ver app/PanelCompras.jsx). Se deja el
  // fallback al script embebido por si se reutiliza este archivo suelto.
  var dataEl = document.getElementById("app-data");
  var STATE = window.__INITIAL_STATE__ || (dataEl ? JSON.parse(dataEl.textContent) : { records: [], meta: {} });
  if (!STATE.meta) STATE.meta = {};

  /* ================= Sincronización con la API / SQLite ================= */
  function apiCreateRecord(payload){
    return fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function(res){
      if (!res.ok) return res.json().then(function(e){ throw new Error(e.error || "No se pudo crear el registro."); });
      return res.json();
    });
  }
  function apiUpdateRecord(id, payload){
    return fetch("/api/records/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function(res){
      if (!res.ok) return res.json().then(function(e){ throw new Error(e.error || "No se pudo actualizar el registro."); });
      return res.json();
    });
  }
  function apiDeleteRecord(id){
    return fetch("/api/records/" + encodeURIComponent(id), { method: "DELETE" }).then(function(res){
      if (!res.ok) return res.json().then(function(e){ throw new Error(e.error || "No se pudo eliminar el registro."); });
      return res.json();
    });
  }
  /* ================= Loading buttons / toast de guardado ================= */
  // Evita doble clic / doble envío: deshabilita el botón y muestra un
  // spinner mientras la promesa de la API está en curso; al terminar,
  // restaura el botón y (si tuvo éxito) muestra un toast de confirmación.
  var savedToastEl = null;
  function showSavedToast(msg){
    if (!savedToastEl){
      savedToastEl = document.createElement("div");
      savedToastEl.className = "saved-toast";
      savedToastEl.innerHTML = '<span class="tick">✓</span><span class="msg"></span>';
      document.body.appendChild(savedToastEl);
    }
    savedToastEl.querySelector(".msg").textContent = msg || "Guardado";
    savedToastEl.classList.add("show");
    clearTimeout(savedToastEl._hideTimer);
    savedToastEl._hideTimer = setTimeout(function(){ savedToastEl.classList.remove("show"); }, 1800);
  }
  function withButtonLoading(btn, run, opts){
    opts = opts || {};
    if (!btn || btn.disabled) return Promise.reject(new Error("busy"));
    var originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> ' + escapeHtml(opts.loadingLabel || "Guardando…");
    function restore(){
      btn.disabled = false;
      btn.classList.remove("btn-loading");
      btn.innerHTML = originalHtml;
    }
    return run().then(function(res){
      restore();
      if (opts.successMessage !== false) showSavedToast(opts.successMessage);
      return res;
    }, function(err){
      restore();
      throw err;
    });
  }

  var ORIGINAL_HTML = null;
  document.addEventListener("DOMContentLoaded", function(){
    ORIGINAL_HTML = "<!doctype html>\n" + document.documentElement.outerHTML;
  }, { once:true });
  // Fallback capture on first interaction in case DOMContentLoaded already fired
  if (document.readyState !== "loading" && !ORIGINAL_HTML) {
    ORIGINAL_HTML = "<!doctype html>\n" + document.documentElement.outerHTML;
  }

  var artifactApi = null;
  var artifactReady = (function(){
    try{
      if (window.claude && typeof window.claude.use === "function"){
        return window.claude.use("artifact").then(function(api){ artifactApi = api; return api; }).catch(function(){ return null; });
      }
    }catch(e){}
    return Promise.resolve(null);
  })();

  var downloadsApi = null;
  (function(){
    try{
      if (window.claude && typeof window.claude.use === "function"){
        window.claude.use("downloads").then(function(api){ downloadsApi = api; }).catch(function(){ downloadsApi = null; });
      }
    }catch(e){}
  })();

  function fmtCOP(n){
    if (n === null || n === undefined || isNaN(n)) return "—";
    return new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n);
  }
  function fmtCompact(n){
    if (n === null || n === undefined || isNaN(n)) return "—";
    return new Intl.NumberFormat("es-CO",{notation:"compact",compactDisplay:"short",maximumFractionDigits:1,style:"currency",currency:"COP"}).format(n);
  }
  function fmtNum(n){
    return new Intl.NumberFormat("es-CO").format(n);
  }
  function esDecimal(n, decimals){
    return new Intl.NumberFormat("es-CO",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(n);
  }
  // Spelled-out peso amounts, e.g. 88900000 -> "88,9 millones de pesos"; 32800 -> "32,8 mil pesos"; 9900 -> "9.900 pesos"
  function fmtPesos(n){
    if (n === null || n === undefined || isNaN(n)) return "—";
    var abs = Math.abs(n);
    if (abs === 0) return "$0";
    if (abs >= 1e6) return esDecimal(n/1e6, 1) + " millones de pesos";
    if (abs >= 1e3) return esDecimal(n/1e3, 1) + " mil pesos";
    return fmtNum(Math.round(n)) + " pesos";
  }
  var MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  function monthKey(iso){ return iso ? iso.slice(0,7) : null; }
  function monthLabel(key, multiYear){
    var parts = key.split("-");
    var y = parseInt(parts[0],10), m = parseInt(parts[1],10);
    var name = MESES[m-1];
    return multiYear ? (name.slice(0,3) + " " + String(y).slice(2)) : name;
  }

  function escapeHtml(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }

  /* ================= Derived / persistence ================= */
  function activeRecords(){ return STATE.records; }

  /* ================= Dashboard de compras: filtro por mes ================= */
  // Filtro de mes único: afecta toda la pestaña "Dashboard de compras"
  // (KPIs, pendientes, gráficas, cumplimiento, áreas, proveedores,
  // responsables y categorías).
  var savingsMonthFilter = "";
  var savingsYearFilter = "";
  function savingsRecords(){
    var recs = activeRecords();
    if (savingsYearFilter){
      recs = recs.filter(function(r){ var k = monthKey(r.fechaSolicitud); return k && k.slice(0,4) === savingsYearFilter; });
    }
    if (!savingsMonthFilter) return recs;
    return recs.filter(function(r){ return monthKey(r.fechaSolicitud) === savingsMonthFilter; });
  }
  function populateSavingsYearOptions(){
    var sel = document.getElementById("savings-year");
    if (!sel) return;
    // Solo los años que realmente tienen registros con fecha de solicitud.
    var years = Array.from(new Set(activeRecords().map(function(r){
      var k = monthKey(r.fechaSolicitud);
      return k ? k.slice(0,4) : null;
    }).filter(Boolean))).sort().reverse();
    var current = sel.value;
    sel.innerHTML = '<option value="">Todos los años</option>' + years.map(function(y){
      return '<option value="'+y+'">'+y+'</option>';
    }).join("");
    sel.value = (years.indexOf(current) !== -1) ? current : "";
    savingsYearFilter = sel.value;
  }
  function populateSavingsMonthOptions(){
    var sel = document.getElementById("savings-month");
    if (!sel) return;
    var keysSource = savingsYearFilter
      ? activeRecords().filter(function(r){ var k = monthKey(r.fechaSolicitud); return k && k.slice(0,4) === savingsYearFilter; })
      : activeRecords();
    var keys = Array.from(new Set(keysSource.map(function(r){ return monthKey(r.fechaSolicitud); }).filter(Boolean)));
    var years = new Set(keys.map(function(k){ return k.slice(0,4); }));
    var multiYear = years.size > 1;
    var ordered = keys.slice().sort().reverse();
    var current = sel.value;
    sel.innerHTML = '<option value="">Todos los meses</option>' + ordered.map(function(k){
      return '<option value="'+k+'">'+monthLabel(k, multiYear)+'</option>';
    }).join("");
    sel.value = (ordered.indexOf(current) !== -1) ? current : "";
    savingsMonthFilter = sel.value;
  }
  var savingsYearSel = document.getElementById("savings-year");
  if (savingsYearSel){
    savingsYearSel.addEventListener("change", function(e){
      savingsYearFilter = e.target.value;
      savingsMonthFilter = "";
      populateSavingsMonthOptions();
      renderSavingsTab();
    });
  }
  var savingsMonthSel = document.getElementById("savings-month");
  if (savingsMonthSel){
    savingsMonthSel.addEventListener("change", function(e){
      savingsMonthFilter = e.target.value;
      renderSavingsTab();
    });
  }
  var savingsMonthClearBtn = document.getElementById("savings-month-clear");
  if (savingsMonthClearBtn){
    savingsMonthClearBtn.addEventListener("click", function(){
      savingsMonthFilter = "";
      savingsYearFilter = "";
      if (savingsMonthSel) savingsMonthSel.value = "";
      if (savingsYearSel) savingsYearSel.value = "";
      populateSavingsMonthOptions();
      renderSavingsTab();
    });
  }

  function persist(rerender){
    STATE.meta.updatedAt = new Date().toISOString();
    var jsonText = JSON.stringify(STATE);
    if (rerender !== false) renderAll();
    if (ORIGINAL_HTML && artifactApi && typeof artifactApi.publish === "function"){
      var newHtml = ORIGINAL_HTML.replace(
        /<script id="app-data" type="application\/json">[\s\S]*?<\/script>/,
        '<script id="app-data" type="application/json">' + jsonText.replace(/<\/script>/g,"<\\/script>") + '<' + '/script>'
      );
      artifactApi.publish(newHtml).catch(function(){ /* conflict: another view published first; ignore */ });
    }
  }

  /* ================= Export panel ================= */
  var exportPanel = document.getElementById("export-panel");
  var btnExport = document.getElementById("btn-export");
  btnExport.addEventListener("click", function(e){
    e.stopPropagation();
    var hidden = exportPanel.hidden;
    if (hidden){ openExportPanel(); } else { closeExportPanel(); }
  });
  var exportMonthSel = document.getElementById("export-month");
  function populateExportMonthOptions(){
    var keys = Array.from(new Set(filteredRecords().map(function(r){ return monthKey(r.fechaSolicitud); }).filter(Boolean)));
    var years = new Set(keys.map(function(k){ return k.slice(0,4); }));
    var multiYear = years.size > 1;
    var ordered = keys.slice().sort().reverse(); // más reciente primero
    var current = exportMonthSel.value;
    exportMonthSel.innerHTML = '<option value="">Todos los meses</option>' + ordered.map(function(k){
      return '<option value="'+k+'">'+monthLabel(k, multiYear)+'</option>';
    }).join("");
    exportMonthSel.value = (ordered.indexOf(current) !== -1) ? current : "";
  }
  function updateExportPanelText(){
    var n = exportRows().length;
    var mk = exportMonthSel.value;
    var monthNote = mk ? (" · " + monthLabel(mk, true)) : "";
    document.getElementById("export-panel-text").textContent =
      "Exporta las " + n + " solicitud(es) de la vista actual de Registros (respeta los filtros aplicados)" + monthNote + ".";
  }
  exportMonthSel.addEventListener("change", updateExportPanelText);
  function openExportPanel(){
    populateExportMonthOptions();
    updateExportPanelText();
    exportPanel.hidden = false;
    btnExport.setAttribute("aria-expanded","true");
  }
  function closeExportPanel(){
    exportPanel.hidden = true;
    btnExport.setAttribute("aria-expanded","false");
  }
  document.addEventListener("click", function(e){
    if (!exportPanel.hidden && !exportPanel.contains(e.target) && e.target !== btnExport && e.target !== exportMonthSel){ closeExportPanel(); }
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !exportPanel.hidden) closeExportPanel(); });

  function todayStamp(){
    var d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function downloadBlob(content, filename, mime){
    var blob = new Blob([content], {type: mime});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }
  /* saveFile: offers a generated file to the viewer. Prefers the platform
     "downloads" capability (required inside the published artifact viewer,
     which blocks plain blob-download links); falls back to a direct
     blob-download anchor when that capability isn't available (e.g. a local
     file:// preview, or before the promise above resolves). */
  function saveFile(filename, data, mime){
    if (downloadsApi && typeof downloadsApi.save === "function"){
      downloadsApi.save({ filename: filename, data: data }).catch(function(err){
        var code = err && err.code;
        if (code === "declined"){ return; }
        // Fall back to a direct download if the capability rejects for any
        // other reason (unavailable, not granted, etc.)
        downloadBlob(data, filename, mime);
      });
    } else {
      downloadBlob(data, filename, mime);
    }
  }

  /* ================= Minimal .docx (OOXML/ZIP) writer =================
     No external libraries are available inside the published artifact, and
     the platform's downloads capability only accepts an allow-listed set of
     extensions (docx is on it, doc is not) — so Word export builds a real,
     minimal .docx (a ZIP of a few small XML parts) by hand instead of an
     HTML file wearing a .doc extension. */
  var CRC_TABLE = (function(){
    var table = new Uint32Array(256);
    for (var n=0; n<256; n++){
      var c = n;
      for (var k=0; k<8; k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes){
    var crc = 0xFFFFFFFF;
    for (var i=0; i<bytes.length; i++){
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(n){ return [n & 0xFF, (n >>> 8) & 0xFF]; }
  function u32(n){ return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
  function strBytes(s){ return Array.from(new TextEncoder().encode(s)); }
  function zipStore(files){
    // files: [{name, data: Uint8Array}] — stored (uncompressed) entries only.
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    files.forEach(function(f){
      var nameBytes = strBytes(f.name);
      var data = f.data;
      var crc = crc32(data);
      var size = data.length;
      var localHeader = []
        .concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21),
                u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), nameBytes);
      var localHeaderBytes = new Uint8Array(localHeader);
      localParts.push(localHeaderBytes, data);
      var centralHeader = []
        .concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21),
                u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0),
                u16(0), u16(0), u32(0), u32(offset), nameBytes);
      centralParts.push(new Uint8Array(centralHeader));
      offset += localHeaderBytes.length + data.length;
    });
    var centralStart = offset;
    var centralSize = centralParts.reduce(function(a,p){ return a+p.length; }, 0);
    var eocd = new Uint8Array([]
      .concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
              u32(centralSize), u32(centralStart), u16(0)));
    var all = localParts.concat(centralParts, [eocd]);
    var total = all.reduce(function(a,p){ return a+p.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    all.forEach(function(p){ out.set(p, pos); pos += p.length; });
    return out;
  }
  function xmlEscape(s){
    return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function docxCell(text, header){
    var runProps = header ? '<w:rPr><w:b/><w:sz w:val="16"/></w:rPr>' : '<w:rPr><w:sz w:val="16"/></w:rPr>';
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:shd w:val="clear" w:fill="'+(header?"F2F2F2":"FFFFFF")+'"/></w:tcPr>'+
      '<w:p><w:r>'+runProps+'<w:t xml:space="preserve">'+xmlEscape(text)+'</w:t></w:r></w:p></w:tc>';
  }
  function buildDocxXml(recs){
    var headers = ["F. solicitud","F. entrega","Área","Responsable","Estado de compra","Categoría","Descripción","Medio de pago","Estado legaliz.","Radicado","Proveedor","Valor + IVA","Observaciones"];
    var totalValor = recs.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);
    var headRow = '<w:tr>'+headers.map(function(h){ return docxCell(h, true); }).join("")+'</w:tr>';
    var bodyRows = recs.map(function(r){
      var cells = [
        fmtDateDisplay(r.fechaSolicitud), r.fechaEntrega? fmtDateDisplay(r.fechaEntrega) : "Pendiente",
        r.area||"—", r.responsable||"—", r.estado||"Sin estado", r.categoria||"—", r.descripcion||"—",
        r.medioPago||"—", r.estadoLegalizacion||"—", (r.radicado?"Sí":"No"), r.proveedor||"—",
        fmtCOP(r.valorConIva), r.observaciones||"—"
      ];
      return '<w:tr>'+cells.map(function(c){ return docxCell(c, false); }).join("")+'</w:tr>';
    }).join("");
    var title = 'Sinco · Compras — Registros';
    var meta = 'Exportado el '+new Date().toLocaleString("es-CO")+' · '+recs.length+' solicitud(es) · Valor total: '+fmtCOP(totalValor);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
      '<w:body>'+
      '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t xml:space="preserve">'+xmlEscape(title)+'</w:t></w:r></w:p>'+
      '<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">'+xmlEscape(meta)+'</w:t></w:r></w:p>'+
      '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'+
      '<w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/>'+
      '<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/>'+
      '<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/>'+
      '</w:tblBorders></w:tblPr><w:tblGrid>'+headers.map(function(){ return '<w:gridCol/>'; }).join("")+'</w:tblGrid>'+headRow+bodyRows+'</w:tbl>'+
      '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>'+
      '</w:body></w:document>';
  }
  function buildDocxBytes(recs){
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'+
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'+
      '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'+
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'+
      '</Relationships>';
    var nowIso = new Date().toISOString();
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'+
      '<dc:title>Registros de compras</dc:title><dc:creator>Sinco · Compras</dc:creator>'+
      '<cp:lastModifiedBy>Sinco · Compras</cp:lastModifiedBy>'+
      '<dcterms:created xsi:type="dcterms:W3CDTF">'+nowIso+'</dcterms:created>'+
      '<dcterms:modified xsi:type="dcterms:W3CDTF">'+nowIso+'</dcterms:modified>'+
      '</cp:coreProperties>';
    var appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Panel de Compras</Application></Properties>';
    var documentXml = buildDocxXml(recs);
    var enc = new TextEncoder();
    var files = [
      { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
      { name: "_rels/.rels", data: enc.encode(rels) },
      { name: "docProps/core.xml", data: enc.encode(core) },
      { name: "docProps/app.xml", data: enc.encode(appXml) },
      { name: "word/document.xml", data: enc.encode(documentXml) }
    ];
    return zipStore(files);
  }
  var EXPORT_HEADERS = ["Fecha solicitud","Fecha entrega","Área","Responsable","Estado de compra","Categoría","Descripción","Medio de pago","Licitación","Estado legalización","Radicado","Proveedor","FE","Valor + IVA","Valor sin IVA","Valor cotizado","Observaciones"];
  function exportRows(){
    var recs = filteredRecords();
    var mk = exportMonthSel.value;
    if (mk) recs = recs.filter(function(r){ return monthKey(r.fechaSolicitud) === mk; });
    return sortRecords(recs);
  }
  function exportRowValues(r){
    return [
      r.fechaSolicitud||"", r.fechaEntrega||"", r.area||"", r.responsable||"", r.estado||"Sin estado", r.categoria||"",
      r.descripcion||"", r.medioPago||"", (r.licitacion!=null?r.licitacion:""), r.estadoLegalizacion||"",
      (r.radicado?"Sí":"No"), r.proveedor||"", r.fe||"",
      (r.valorConIva!=null?r.valorConIva:""), (r.valorSinIva!=null?r.valorSinIva:""), (r.valorCot!=null?r.valorCot:""),
      r.observaciones||""
    ];
  }
  function toCsvValue(v){
    var s = v===null||v===undefined? "" : String(v);
    if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
    return s;
  }
  function exportExcel(){
    var recs = exportRows();
    var lines = [EXPORT_HEADERS.map(toCsvValue).join(";")];
    recs.forEach(function(r){ lines.push(exportRowValues(r).map(toCsvValue).join(";")); });
    var csv = "﻿" + lines.join("\r\n");
    saveFile("compras_registros_"+todayStamp()+".csv", csv, "text/csv;charset=utf-8;");
    closeExportPanel();
  }
  var PDF_HEADERS = ["F. solicitud","F. entrega","Área","Responsable","Estado de compra","Categoría","Descripción","Medio de pago","Estado legaliz.","Radicado","Proveedor","Valor + IVA","Observaciones"];
  function exportPDF(){
    var jspdfNS = window.jspdf;
    if (!jspdfNS || !jspdfNS.jsPDF){
      alert("No se pudo generar el PDF: el generador no cargó correctamente. Recarga la página e inténtalo de nuevo.");
      return;
    }
    var recs = exportRows();
    var totalValor = recs.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);
    var rows = recs.map(function(r){
      return [
        fmtDateDisplay(r.fechaSolicitud), r.fechaEntrega? fmtDateDisplay(r.fechaEntrega) : "Pendiente",
        r.area||"—", r.responsable||"—", r.estado||"Sin estado", r.categoria||"—", r.descripcion||"—",
        r.medioPago||"—", r.estadoLegalizacion||"—", (r.radicado?"Sí":"No"), r.proveedor||"—",
        fmtCOP(r.valorConIva), r.observaciones||"—"
      ];
    });
    var doc = new jspdfNS.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Sinco · Compras — Registros", 28, 26);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(85,85,85);
    var meta = "Exportado el "+new Date().toLocaleString("es-CO")+" · "+recs.length+" solicitud(es) · Valor total: "+fmtCOP(totalValor);
    doc.text(meta, 28, 40);
    doc.autoTable({
      head: [PDF_HEADERS],
      body: rows,
      startY: 52,
      margin: { left: 20, right: 20 },
      styles: { font: "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [242,242,242], textColor: [20,20,20], fontStyle: "bold", lineWidth: 0.4, lineColor: [204,204,204] },
      bodyStyles: { lineWidth: 0.4, lineColor: [204,204,204] },
      columnStyles: { 11: { halign: "right" } },
      didDrawPage: function(data){
        doc.setFontSize(8); doc.setTextColor(140,140,140);
        doc.text("Página " + doc.internal.getNumberOfPages(), doc.internal.pageSize.getWidth() - 60, doc.internal.pageSize.getHeight() - 12);
      }
    });
    var blob = doc.output("blob");
    saveFile("compras_registros_"+todayStamp()+".pdf", blob, "application/pdf");
    closeExportPanel();
  }
  function exportWord(){
    var recs = exportRows();
    var bytes = buildDocxBytes(recs);
    var blob = new Blob([bytes], {type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    saveFile("compras_registros_"+todayStamp()+".docx", blob, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    closeExportPanel();
  }
  document.getElementById("export-excel").addEventListener("click", exportExcel);
  document.getElementById("export-pdf").addEventListener("click", exportPDF);
  document.getElementById("export-word").addEventListener("click", exportWord);

  /* ================= PDF export: Panel y Dashboard de compras =================
     Captura tal cual lo que se ve en pantalla — KPIs, gráficas (SVG) y
     tablas, con el mismo diseño — respetando el filtro de mes propio de
     cada pestaña, y la reparte en páginas del PDF como una "impresión"
     de la vista (no reconstruye los datos por separado). */
  function pdfExportBusy(btn, busy){
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Generando…" : btn.getAttribute("data-label");
  }
  /* html2canvas's CSS parser throws on the modern color-mix() function used
     by a few rules in the theme (topbar wash, status pills), which aborts
     the whole capture — not just those elements. html2canvas builds its
     capture from a full document clone, and a plain DOM clone copies a
     <style> tag's authored TEXT, not any live CSSOM-only mutation — so the
     fix has to rewrite the stylesheet's actual textContent (not just
     rule.style.setProperty) before capture, then restore the original text
     afterward. Each color-mix(in srgb, var(--x) N%, transparent) is swapped
     for an equivalent solid rgba(), resolved from the live CSS variables so
     it matches the active theme. */
  function withColorMixPatched(runCapture){
    function resolveVarHex(name){
      return (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
    }
    function hexToRgb(hex){
      hex = (hex||"").replace("#","");
      if (hex.length === 3) hex = hex.split("").map(function(c){ return c+c; }).join("");
      var num = parseInt(hex, 16);
      if (isNaN(num)) return [0,0,0];
      return [(num>>16)&255, (num>>8)&255, num&255];
    }
    var styleEls = Array.from(document.querySelectorAll("style")).filter(function(s){
      return s.textContent.indexOf("color-mix(") !== -1;
    });
    var restores = styleEls.map(function(styleEl){
      var orig = styleEl.textContent;
      var patched = orig.replace(
        /color-mix\(in srgb,\s*var\((--[a-zA-Z0-9-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g,
        function(full, varName, pct){
          var rgb = hexToRgb(resolveVarHex(varName));
          return "rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(parseFloat(pct)/100)+")";
        }
      );
      styleEl.textContent = patched;
      return function(){ styleEl.textContent = orig; };
    });
    function restoreAll(){ restores.forEach(function(r){ r(); }); }
    var result;
    try{ result = runCapture(); }
    catch(e){ restoreAll(); throw e; }
    return Promise.resolve(result).then(
      function(v){ restoreAll(); return v; },
      function(e){ restoreAll(); throw e; }
    );
  }
  function captureViewToPdf(viewSelector, title, subtitle){
    if (typeof window.html2canvas !== "function" || !window.jspdf || !window.jspdf.jsPDF){
      return Promise.reject(new Error("libs-not-loaded"));
    }
    var el = document.querySelector(viewSelector);
    if (!el) return Promise.reject(new Error("view-not-found"));
    var pageBg = (getComputedStyle(document.documentElement).getPropertyValue("--page")||"#f2ede3").trim();
    return withColorMixPatched(function(){ return window.html2canvas(el, {
      backgroundColor: pageBg,
      scale: Math.max(1.5, Math.min(2, window.devicePixelRatio || 1.5)),
      useCORS: false,
      windowWidth: 1360,
      ignoreElements: function(node){
        return !!(node.getAttribute && node.getAttribute("data-no-export") === "true");
      }
    }).then(function(canvas){
      var doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var margin = 20;
      var titleBlockH = 40;
      var usableW = pageW - margin*2;
      var scaleRatio = usableW / canvas.width; // canvas px -> pt
      var firstSliceCanvasH = Math.floor((pageH - margin*2 - titleBlockH) / scaleRatio);
      var normalSliceCanvasH = Math.floor((pageH - margin*2) / scaleRatio);
      var y = 0, first = true;
      var sliceCanvas = document.createElement("canvas");
      var sctx = sliceCanvas.getContext("2d");
      while (y < canvas.height){
        var sliceH = Math.min(first ? firstSliceCanvasH : normalSliceCanvasH, canvas.height - y);
        if (sliceH <= 0) break;
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        sctx.clearRect(0,0,sliceCanvas.width,sliceCanvas.height);
        sctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        var imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        if (!first) doc.addPage();
        var imgY = margin;
        if (first){
          doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(20,20,20);
          doc.text(title, margin, margin+14);
          doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(85,85,85);
          doc.text(subtitle, margin, margin+29);
          imgY = margin + titleBlockH;
        }
        doc.addImage(imgData, "JPEG", margin, imgY, usableW, sliceH*scaleRatio);
        y += sliceH;
        first = false;
      }
      var n = doc.internal.getNumberOfPages();
      for (var i=1; i<=n; i++){
        doc.setPage(i);
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(140,140,140);
        doc.text("Página " + i + " de " + n, pageW - 70, pageH - 10);
      }
      return doc;
    }); });
  }
  function exportSavingsPDF(){
    var btn = savingsExportPdfBtn;
    var monthTxt = savingsMonthFilter ? monthLabel(savingsMonthFilter, true) : "Todos los meses";
    var subtitle = "Mes: " + monthTxt + " · Exportado el " + new Date().toLocaleString("es-CO");
    pdfExportBusy(btn, true);
    captureViewToPdf("#view-savings", "Sinco · Compras — Dashboard de compras", subtitle).then(function(doc){
      var blob = doc.output("blob");
      var suffix = savingsMonthFilter || "todos";
      saveFile("dashboard_compras_"+suffix+"_"+todayStamp()+".pdf", blob, "application/pdf");
    }).catch(function(){
      alert("No se pudo generar el PDF: el generador no cargó correctamente. Recarga la página e inténtalo de nuevo.");
    }).then(function(){ pdfExportBusy(btn, false); });
  }
  var savingsExportPdfBtn = document.getElementById("savings-export-pdf");
  if (savingsExportPdfBtn){
    savingsExportPdfBtn.setAttribute("data-label", savingsExportPdfBtn.textContent);
    savingsExportPdfBtn.addEventListener("click", exportSavingsPDF);
  }

  /* ================= Tabs ================= */
  // Recuerda la pestaña activa entre sesiones del navegador. También evita que,
  // al guardar un cambio (persist() republica la página y el visor recarga TODAS
  // las vistas abiertas a esa nueva versión), el usuario quede "expulsado" de la
  // pestaña en la que estaba de vuelta a la pestaña por defecto.
  function getStoredTab(){
    try{ return sessionStorage.getItem("sinco-compras-tab"); }catch(e){ return null; }
  }
  function setStoredTab(which){
    try{ sessionStorage.setItem("sinco-compras-tab", which); }catch(e){}
  }
  var tabRegistros = document.getElementById("tab-registros");
  var tabSavings = document.getElementById("tab-savings");
  var viewRegistros = document.getElementById("view-registros");
  var viewSavings = document.getElementById("view-savings");
  tabRegistros.addEventListener("click", function(){ switchTab("registros"); });
  tabSavings.addEventListener("click", function(){ switchTab("savings"); });
  function switchTab(which){
    if (which !== "registros" && which !== "savings") which = "savings";
    tabRegistros.setAttribute("aria-selected", which==="registros" ? "true":"false");
    tabSavings.setAttribute("aria-selected", which==="savings" ? "true":"false");
    viewRegistros.hidden = which!=="registros";
    viewSavings.hidden = which!=="savings";
    if (which==="registros") renderTable();
    if (which==="savings") renderSavingsTab();
    if (which==="registros") updateStickyOffsets();
    setStoredTab(which);
  }

  /* ================= Colapsar/expandir barra lateral ================= */
  // Recuerda el estado colapsado entre sesiones, igual que la pestaña activa.
  function getStoredSidebar(){
    try{ return sessionStorage.getItem("sinco-compras-sidebar"); }catch(e){ return null; }
  }
  function setStoredSidebar(collapsed){
    try{ sessionStorage.setItem("sinco-compras-sidebar", collapsed ? "1" : "0"); }catch(e){}
  }
  var sidebarEl = document.getElementById("app-sidebar");
  var sidebarToggle = document.getElementById("sidebar-toggle");
  function setSidebarCollapsed(collapsed){
    sidebarEl.classList.toggle("collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    sidebarToggle.setAttribute("aria-label", collapsed ? "Expandir menú" : "Colapsar menú");
  }
  setSidebarCollapsed(getStoredSidebar() === "1");
  sidebarToggle.addEventListener("click", function(){
    var collapsed = !sidebarEl.classList.contains("collapsed");
    setSidebarCollapsed(collapsed);
    setStoredSidebar(collapsed);
  });

  /* ================= Sticky header offsets (Registros) ================= */
  var stickyTopbarEl = document.getElementById("app-topbar");
  var stickyToolbarEl = document.getElementById("registros-toolbar");
  function updateStickyOffsets(){
    if (!stickyTopbarEl) return;
    var root = document.documentElement;
    var topbarH = stickyTopbarEl.getBoundingClientRect().height;
    root.style.setProperty("--topbar-h", topbarH + "px");
    if (stickyToolbarEl && !viewRegistros.hidden){
      var toolbarH = stickyToolbarEl.getBoundingClientRect().height;
      root.style.setProperty("--reg-toolbar-h", toolbarH + "px");
      var footerEl = document.querySelector("#view-registros .table-footer");
      var footerH = footerEl ? footerEl.getBoundingClientRect().height : 54;
      var maxH = window.innerHeight - topbarH - toolbarH - footerH - 96;
      if (maxH < 220) maxH = 220;
      root.style.setProperty("--table-scroll-max-h", maxH + "px");
    }
  }
  updateStickyOffsets();
  var stickyResizeTimer = null;
  window.addEventListener("resize", function(){
    clearTimeout(stickyResizeTimer);
    stickyResizeTimer = setTimeout(updateStickyOffsets, 120);
  });

  /* ================= Tooltip ================= */
  var tooltipEl = document.getElementById("tooltip");
  function showTooltip(evt, html){
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    tooltipEl.style.left = evt.clientX + "px";
    tooltipEl.style.top = evt.clientY + "px";
  }
  function moveTooltip(evt){
    tooltipEl.style.left = evt.clientX + "px";
    tooltipEl.style.top = evt.clientY + "px";
  }
  function hideTooltip(){ tooltipEl.hidden = true; }

  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs){
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* ================= KPIs ================= */
  function renderKPIs(){
    var recs = savingsRecords().filter(function(r){ return r.estado !== "Anulado"; });
    var byMonth = {};
    recs.forEach(function(r){
      var mk = monthKey(r.fechaSolicitud);
      if (!mk) return;
      byMonth[mk] = (byMonth[mk]||0) + (r.valorConIva||0);
    });
    var months = Object.keys(byMonth).sort();
    var allYears = new Set(activeRecords().map(function(r){ return r.fechaSolicitud ? r.fechaSolicitud.slice(0,4) : null; }).filter(Boolean));
    var headlineMultiYear = allYears.size > 1;
    var currentKey = monthKey(fmtISO(new Date()));
    var closedMonths = months.filter(function(m){ return m !== currentKey; });
    var headlineKey = closedMonths.length ? closedMonths[closedMonths.length-1] : months[months.length-1];
    var headlineIdx = closedMonths.length ? closedMonths.length-1 : -1;
    var prevKey = headlineIdx > 0 ? closedMonths[headlineIdx-1] : null;
    var headlineVal = headlineKey ? (byMonth[headlineKey]||0) : 0;
    var prevVal = prevKey ? byMonth[prevKey] : null;
    var currentVal = byMonth[currentKey];

    var enProceso = recs.filter(function(r){ return r.estado === "Proceso"; });
    var enProcesoValor = enProceso.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);

    var withValue = recs.filter(function(r){ return r.valorConIva; });
    var avgTicket = withValue.length ? (withValue.reduce(function(a,r){return a+r.valorConIva;},0) / withValue.length) : 0;

    var comp = computeCompliance(recs);

    var deltaHtml = "";
    if (prevVal !== null && prevVal !== undefined){
      var pct = prevVal === 0 ? 0 : ((headlineVal - prevVal) / prevVal * 100);
      var arrow = pct > 0.5 ? "▲" : (pct < -0.5 ? "▼" : "＝");
      deltaHtml = '<span class="delta flat">'+arrow+' '+Math.abs(pct).toFixed(0)+'% vs '+ (prevKey?monthLabel(prevKey,false):"") +'</span>';
    }
    var currentNote = (currentVal !== undefined) ? (monthLabel(currentKey,false)+" (en curso): "+fmtPesos(currentVal)+" hasta hoy") : "";
    var headlineLabel = savingsMonthFilter
      ? monthLabel(headlineKey, headlineMultiYear) + " · mes seleccionado"
      : (headlineKey?monthLabel(headlineKey,false):"Mes anterior") + " · último mes cerrado";

    var tiles = [
      {
        label: headlineLabel,
        value: fmtPesos(headlineVal),
        extra: deltaHtml,
        foot: currentNote || fmtPesos(headlineVal)
      },
      {
        label: "Cumplimiento de tiempos",
        value: (comp.pct===null? "—" : comp.pct.toFixed(0)+"%"),
        meter: comp.pct,
        foot: comp.total + " compras con fecha de entrega"
      },
      {
        label: "En proceso",
        value: fmtNum(enProceso.length),
        foot: fmtPesos(enProcesoValor) + " en solicitudes abiertas"
      },
      {
        label: "Ticket promedio",
        value: fmtPesos(avgTicket),
        foot: withValue.length + " compras con valor registrado"
      }
    ];

    var row = document.getElementById("kpi-row");
    row.innerHTML = tiles.map(function(t){
      var meterHtml = "";
      if (t.meter !== undefined && t.meter !== null){
        var color = t.meter >= 80 ? "var(--good)" : (t.meter >= 50 ? "var(--warning)" : "var(--critical)");
        meterHtml = '<div class="meter-track"><div class="meter-fill" style="width:'+Math.min(100,t.meter)+'%; background:'+color+';"></div></div>';
      }
      return '<div class="kpi">'+
        '<span class="label">'+escapeHtml(t.label)+'</span>'+
        '<span class="value">'+t.value+'</span>'+
        (t.extra||"") + meterHtml +
        '<span class="foot">'+escapeHtml(t.foot)+'</span>'+
      '</div>';
    }).join("");
  }

  /* ================= Chart: valor por mes ================= */
  function renderMonthChart(){
    var recs = savingsRecords().filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud; });
    var byMonth = {};
    recs.forEach(function(r){
      var mk = monthKey(r.fechaSolicitud);
      byMonth[mk] = (byMonth[mk]||0) + (r.valorConIva||0);
    });
    var years = new Set(Object.keys(byMonth).map(function(k){return k.slice(0,4);}));
    var multiYear = years.size > 1;
    var months = Object.keys(byMonth).sort();
    var currentKey = monthKey(fmtISO(new Date()));

    var width = 900, height = 250;
    var padL = 92, padR = 16, padT = 24, padB = 30;
    var innerW = width - padL - padR, innerH = height - padT - padB;
    var maxVal = Math.max.apply(null, months.map(function(k){return byMonth[k];}).concat([1]));
    var niceMax = maxVal * 1.15;
    var barW = innerW / months.length * 0.58;
    var step = innerW / months.length;

    var svg = svgEl("svg", {viewBox:"0 0 "+width+" "+height, width:"100%", height:height, role:"img", "aria-label":"Valor de compras por mes"});
    // gridlines
    var ticks = 4;
    for (var i=0;i<=ticks;i++){
      var y = padT + innerH - (innerH * i/ticks);
      var val = niceMax * i/ticks;
      svg.appendChild(svgEl("line",{x1:padL,x2:width-padR,y1:y,y2:y,class:"gridline"}));
      var t = svgEl("text",{x:padL-8, y:y+3, class:"axis-label", "text-anchor":"end"});
      t.textContent = fmtCOP(val);
      svg.appendChild(t);
    }
    svg.appendChild(svgEl("line",{x1:padL,x2:width-padR,y1:padT+innerH,y2:padT+innerH,class:"baseline"}));

    months.forEach(function(mk, idx){
      var val = byMonth[mk];
      var barH = innerH * (val/niceMax);
      var x = padL + step*idx + (step-barW)/2;
      var y = padT + innerH - barH;
      var isCurrent = mk === currentKey;
      var color = isCurrent ? "var(--accent)" : "var(--s1)";
      var opacity = isCurrent ? "1" : "0.62";
      var path = roundedTopRect(x, y, barW, barH, 4);
      var rect = svgEl("path", {d: path, fill: color, opacity: opacity, class:"mark"});
      rect.addEventListener("mousemove", function(e){
        showTooltip(e, '<div class="tt-title">'+monthLabel(mk,multiYear)+'</div>'+fmtCOP(val));
      });
      rect.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(rect);

      var label = svgEl("text",{x:x+barW/2, y: y-6, class:"bar-total-label", "text-anchor":"middle"});
      label.textContent = fmtCOP(val);
      if (barH > 14) svg.appendChild(label);

      var xt = svgEl("text",{x:x+barW/2, y: height-10, class:"axis-label", "text-anchor":"middle"});
      xt.textContent = monthLabel(mk, multiYear);
      svg.appendChild(xt);
    });

    var wrap = document.getElementById("chart-month");
    wrap.innerHTML = "";
    wrap.appendChild(svg);
  }

  function roundedTopRect(x,y,w,h,r){
    if (h <= 0) return "";
    r = Math.min(r, w/2, h);
    return "M"+x+","+(y+h)+
      " L"+x+","+(y+r)+
      " Q"+x+","+y+" "+(x+r)+","+y+
      " L"+(x+w-r)+","+y+
      " Q"+(x+w)+","+y+" "+(x+w)+","+(y+r)+
      " L"+(x+w)+","+(y+h)+" Z";
  }

  /* ================= Chart: área por mes (stacked) ================= */
  var AREA_COLORS = { "__slots__": ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)"] };
  function topAreasByValue(recs, n){
    var totals = {};
    recs.forEach(function(r){
      var a = r.area || "Sin área";
      totals[a] = (totals[a]||0) + (r.valorConIva||0);
    });
    var sorted = Object.keys(totals).sort(function(a,b){ return totals[b]-totals[a]; });
    return sorted.slice(0,n);
  }
  function renderAreaMonthChart(){
    var recs = savingsRecords().filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud; });
    var top5 = topAreasByValue(recs, 5);
    var top5set = new Set(top5);
    var months = Array.from(new Set(recs.map(function(r){return monthKey(r.fechaSolicitud);}))).sort();
    var years = new Set(months.map(function(k){return k.slice(0,4);}));
    var multiYear = years.size > 1;

    var series = top5.concat(["Otras"]);
    var colorFor = {};
    top5.forEach(function(a,i){ colorFor[a] = AREA_COLORS.__slots__[i]; });
    colorFor["Otras"] = "var(--sOther)";

    var data = {}; // month -> area -> value
    months.forEach(function(m){ data[m] = {}; series.forEach(function(s){ data[m][s]=0; }); });
    recs.forEach(function(r){
      var mk = monthKey(r.fechaSolicitud);
      var a = r.area || "Sin área";
      var key = top5set.has(a) ? a : "Otras";
      data[mk][key] += (r.valorConIva||0);
    });

    var totals = months.map(function(m){
      return series.reduce(function(a,s){return a+data[m][s];},0);
    });
    var maxTotal = Math.max.apply(null, totals.concat([1])) * 1.15;

    var width = 560, height = 260;
    var padL = 46, padR = 12, padT = 14, padB = 30;
    var innerW = width-padL-padR, innerH = height-padT-padB;
    var step = innerW/months.length;
    var barW = step*0.6;

    var svg = svgEl("svg",{viewBox:"0 0 "+width+" "+height, width:"100%", height:height});
    var ticks=4;
    for (var i=0;i<=ticks;i++){
      var y = padT+innerH-(innerH*i/ticks);
      svg.appendChild(svgEl("line",{x1:padL,x2:width-padR,y1:y,y2:y,class:"gridline"}));
      var t = svgEl("text",{x:padL-8,y:y+3,class:"axis-label","text-anchor":"end"});
      t.textContent = fmtCompact(maxTotal*i/ticks).replace("COP","").trim();
      svg.appendChild(t);
    }
    svg.appendChild(svgEl("line",{x1:padL,x2:width-padR,y1:padT+innerH,y2:padT+innerH,class:"baseline"}));

    months.forEach(function(mk, idx){
      var x = padL + step*idx + (step-barW)/2;
      var yCursor = padT+innerH;
      series.forEach(function(s){
        var val = data[mk][s];
        if (val <= 0) return;
        var h = innerH * (val/maxTotal);
        var y = yCursor - h;
        var rect = svgEl("rect", {x:x, y:y, width:barW, height: Math.max(0,h-2), fill: colorFor[s], class:"mark", rx:2});
        rect.addEventListener("mousemove", function(e){
          showTooltip(e, '<div class="tt-title">'+s+' · '+monthLabel(mk,multiYear)+'</div>'+fmtPesos(val));
        });
        rect.addEventListener("mouseleave", hideTooltip);
        svg.appendChild(rect);
        yCursor = y;
      });
      var total = totals[idx];
      if (total > 0){
        var tl = svgEl("text",{x:x+barW/2, y: (padT+innerH-innerH*(total/maxTotal))-6, class:"bar-total-label", "text-anchor":"middle"});
        tl.textContent = fmtCompact(total);
        svg.appendChild(tl);
      }
      var xt = svgEl("text",{x:x+barW/2, y:height-10, class:"axis-label", "text-anchor":"middle"});
      xt.textContent = monthLabel(mk, multiYear);
      svg.appendChild(xt);
    });

    var wrap = document.getElementById("chart-area-month");
    wrap.innerHTML = "";
    wrap.appendChild(svg);

    var legend = document.getElementById("legend-area");
    legend.innerHTML = series.map(function(s){
      return '<span class="chip"><span class="swatch" style="background:'+colorFor[s]+'"></span>'+escapeHtml(s)+'</span>';
    }).join("");
  }

  /* ================= Estado chart ================= */
  function renderEstadoChart(){
    var recs = savingsRecords();
    var groups = {};
    recs.forEach(function(r){
      var e = r.estado || "Sin estado";
      if (!groups[e]) groups[e] = {count:0, valor:0};
      groups[e].count++;
      groups[e].valor += (r.valorConIva||0);
    });
    var order = ["Ejecutado","Proceso","Pendiente","Anulado","Sin estado"];
    var keys = order.filter(function(k){return groups[k];}).concat(Object.keys(groups).filter(function(k){return order.indexOf(k)===-1;}));
    var colorMap = { "Ejecutado":"var(--good)", "Proceso":"var(--warning)", "Anulado":"var(--critical)", "Pendiente":"var(--muted)", "Sin estado":"var(--muted)" };
    var maxCount = Math.max.apply(null, keys.map(function(k){return groups[k].count;}).concat([1]));

    var html = keys.map(function(k){
      var g = groups[k];
      var pct = (g.count/maxCount*100);
      var color = colorMap[k] || "var(--muted)";
      return '<div class="estado-row">'+
        '<span class="name" style="color:'+color+'">'+escapeHtml(k)+'</span>'+
        '<div class="track"><div class="fill" style="width:'+pct+'%; background:'+color+';"></div></div>'+
        '<span class="figs"><span class="n">'+fmtCOP(g.valor)+'</span><span class="c">'+g.count+' solicitud(es)</span></span>'+
      '</div>';
    }).join("");
    document.getElementById("chart-estado").innerHTML = html;
  }

  /* ================= Medio de pago chart ================= */
  var MEDIO_COLORS = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--sOther)"];
  function renderMedioChart(){
    var recs = savingsRecords().filter(function(r){ return r.estado !== "Anulado"; });
    var groups = {};
    recs.forEach(function(r){
      var m = r.medioPago || "Sin dato";
      if (!groups[m]) groups[m] = {count:0, valor:0};
      groups[m].count++;
      groups[m].valor += (r.valorConIva||0);
    });
    var keys = Object.keys(groups).sort(function(a,b){ return groups[b].valor-groups[a].valor; });
    var maxVal = Math.max.apply(null, keys.map(function(k){return groups[k].valor;}).concat([1]));
    var html = keys.map(function(k, i){
      var g = groups[k];
      var pct = (g.valor/maxVal*100);
      var color = MEDIO_COLORS[i % MEDIO_COLORS.length];
      return '<div class="medio-row">'+
        '<span class="name">'+escapeHtml(k)+'</span>'+
        '<div class="track"><div class="fill" style="width:'+pct+'%; background:'+color+';"></div></div>'+
        '<span class="figs"><span class="n">'+fmtCOP(g.valor)+'</span><span class="c">'+g.count+' compra(s)</span></span>'+
      '</div>';
    }).join("");
    document.getElementById("chart-medio").innerHTML = html;
  }

  /* ================= Compliance / días ================= */
  function computeCompliance(recsBase){
    var recs = (recsBase || activeRecords()).filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud && r.fechaEntrega; });
    var total = recs.length;
    var ok = recs.filter(function(r){ var d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega); return d !== null && d <= 8; }).length;
    return { total: total, ok: ok, pct: total ? (ok/total*100) : null };
  }
  function renderComplianceSection(){
    var comp = computeCompliance(savingsRecords());
    document.getElementById("compliance-value").textContent = comp.pct===null? "—" : comp.pct.toFixed(0)+"%";
    document.getElementById("compliance-foot").textContent = comp.total ? (comp.ok+" de "+comp.total+" dentro del plazo") : "Sin datos de entrega";
    var fill = document.getElementById("compliance-fill");
    var pct = comp.pct||0;
    fill.style.width = Math.min(100,pct)+"%";
    fill.style.background = pct>=80? "var(--good)" : (pct>=50? "var(--warning)":"var(--critical)");

    var recs = savingsRecords().filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud && !r.fechaEntrega; });
    var risky = recs.map(function(r){
      var el = businessDaysElapsedToToday(r.fechaSolicitud);
      return {r:r, elapsed: el};
    }).filter(function(x){ return x.elapsed !== null && x.elapsed > 8; });
    document.getElementById("risk-value").textContent = risky.length;

    // histogram
    var withDias = savingsRecords()
      .filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud && r.fechaEntrega; })
      .map(function(r){ return businessDaysBetween(r.fechaSolicitud, r.fechaEntrega); })
      .filter(function(d){ return d !== null; });
    var buckets = [
      {label:"0-2", min:0, max:2}, {label:"3-4", min:3, max:4}, {label:"5-6", min:5, max:6},
      {label:"7-8", min:7, max:8}, {label:"9-12", min:9, max:12}, {label:"13+", min:13, max:9999}
    ];
    buckets.forEach(function(b){ b.count = withDias.filter(function(d){return d>=b.min && d<=b.max;}).length; });
    var maxCount = Math.max.apply(null, buckets.map(function(b){return b.count;}).concat([1]));

    var width=520, height=180, padL=30, padR=12, padT=10, padB=28;
    var innerW=width-padL-padR, innerH=height-padT-padB;
    var step = innerW/buckets.length, barW=step*0.56;
    var svg = svgEl("svg",{viewBox:"0 0 "+width+" "+height, width:"100%", height:height});
    svg.appendChild(svgEl("line",{x1:padL,x2:width-padR,y1:padT+innerH,y2:padT+innerH,class:"baseline"}));
    buckets.forEach(function(b, idx){
      var h = innerH*(b.count/maxCount);
      var x = padL+step*idx+(step-barW)/2;
      var y = padT+innerH-h;
      var withinLimit = b.max<=8;
      var color = withinLimit? "var(--good)":"var(--critical)";
      var path = roundedTopRect(x,y,barW,h,3);
      var rect = svgEl("path",{d:path, fill:color, opacity:0.85, class:"mark"});
      rect.addEventListener("mousemove", function(e){
        showTooltip(e, '<div class="tt-title">'+b.label+' días</div>'+b.count+' compra(s)');
      });
      rect.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(rect);
      if (b.count>0){
        var lbl = svgEl("text",{x:x+barW/2,y:y-5,class:"bar-total-label","text-anchor":"middle"});
        lbl.textContent = b.count;
        svg.appendChild(lbl);
      }
      var xt = svgEl("text",{x:x+barW/2,y:height-10,class:"axis-label","text-anchor":"middle"});
      xt.textContent = b.label;
      svg.appendChild(xt);
    });
    var wrap = document.getElementById("chart-dias");
    wrap.innerHTML = "";
    wrap.appendChild(svg);

    // offenders table
    var offenders = savingsRecords()
      .filter(function(r){ return r.estado !== "Anulado" && r.fechaSolicitud && r.fechaEntrega; })
      .map(function(r){ return {r:r, dias: businessDaysBetween(r.fechaSolicitud, r.fechaEntrega)}; })
      .filter(function(x){ return x.dias !== null && x.dias > 8; })
      .sort(function(a,b){ return b.dias-a.dias; })
      .slice(0,6);
    var body = document.getElementById("offenders-body");
    if (!offenders.length){
      body.innerHTML = '<tr><td colspan="4" style="color:var(--muted); text-align:center; padding:14px;">Sin incumplimientos registrados</td></tr>';
    } else {
      body.innerHTML = offenders.map(function(x){
        return '<tr><td>'+escapeHtml(x.r.descripcion||"—")+'</td><td>'+escapeHtml(x.r.area||"—")+'</td>'+
          '<td class="num mono">'+x.dias+'</td><td>'+estadoPill(x.r.estado)+'</td></tr>';
      }).join("");
    }
  }

  function estadoPill(estado){
    var map = { "Ejecutado":"good", "Proceso":"warning", "Anulado":"critical" };
    var cls = map[estado] || "muted";
    return '<span class="pill '+cls+'">'+escapeHtml(estado||"Sin estado")+'</span>';
  }

  function legalizacionClass(v){
    var map = { "ACTA":"good", "OC":"warning", "N/A":"muted" };
    return map[v] || "muted";
  }

  /* ================= Dashboard de compras (3ª pestaña) ================= */
  function computeSavings(recsBase){
    var recs = (recsBase || activeRecords()).filter(function(r){ return r.estado !== "Anulado"; });
    var totalCompras = recs.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);

    var conCot = recs.filter(function(r){ return r.valorCot!==null && r.valorCot!==undefined && r.valorCot > 0; });
    var outliers = conCot.filter(function(r){ return r.valorConIva && r.valorCot > r.valorConIva * 20; });
    var cotizados = conCot.filter(function(r){ return outliers.indexOf(r) === -1; });

    var valorCotizado = cotizados.reduce(function(a,r){ return a+r.valorCot; }, 0);
    var valorCompraCotizados = cotizados.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);
    var ahorroTotal = valorCotizado - valorCompraCotizados;
    var pctAhorro = valorCotizado ? (ahorroTotal/valorCotizado*100) : null;

    var mayorAhorro = null;
    cotizados.forEach(function(r){
      var ah = r.valorCot - (r.valorConIva||0);
      if (!mayorAhorro || ah > mayorAhorro.ahorro) mayorAhorro = { r: r, ahorro: ah };
    });

    var areaTotals = {};
    recs.forEach(function(r){
      var a = r.area || "Sin área";
      if (!areaTotals[a]) areaTotals[a] = { area:a, count:0, valor:0, cotizado:0, compraCot:0 };
      areaTotals[a].count++;
      areaTotals[a].valor += (r.valorConIva||0);
    });
    cotizados.forEach(function(r){
      var a = r.area || "Sin área";
      areaTotals[a].cotizado += r.valorCot;
      areaTotals[a].compraCot += (r.valorConIva||0);
    });
    var areaTop = null;
    Object.keys(areaTotals).forEach(function(a){
      if (!areaTop || areaTotals[a].valor > areaTop.valor) areaTop = areaTotals[a];
    });

    var ejecutados = recs.filter(function(r){ return r.estado === "Ejecutado"; });
    var totalEjecutado = ejecutados.reduce(function(a,r){ return a+(r.valorConIva||0); }, 0);

    var proveedorTotals = {};
    recs.forEach(function(r){
      var p = r.proveedor || "Sin proveedor";
      if (!proveedorTotals[p]) proveedorTotals[p] = { proveedor:p, count:0, valor:0 };
      proveedorTotals[p].count++;
      proveedorTotals[p].valor += (r.valorConIva||0);
    });
    var topProveedores = Object.keys(proveedorTotals).map(function(p){ return proveedorTotals[p]; })
      .sort(function(a,b){ return b.valor-a.valor; }).slice(0,5);

    return {
      n: recs.length, totalCompras: totalCompras,
      valorCotizado: valorCotizado, valorCompraCotizados: valorCompraCotizados,
      ahorroTotal: ahorroTotal, pctAhorro: pctAhorro,
      cotizadosN: cotizados.length, outliersN: outliers.length,
      mayorAhorro: mayorAhorro, areaTotals: areaTotals, areaTop: areaTop,
      totalEjecutado: totalEjecutado, ejecutadosN: ejecutados.length,
      topProveedores: topProveedores
    };
  }

  function renderSavingsKPIs(s){
    var tiles = [
      { label:"Total compras", value: fmtPesos(s.totalCompras), foot: s.n+" solicitudes (excluye anuladas)" },
      { label:"Valor cotizado", value: fmtPesos(s.valorCotizado), foot: s.cotizadosN+" compras con cotización comparable" },
      { label:"Valor compra (cotizados)", value: fmtPesos(s.valorCompraCotizados), foot: "Sobre las mismas "+s.cotizadosN+" compras" },
      { label:"Ahorro total", value: fmtPesos(s.ahorroTotal), foot: "Cotizado − comprado" },
      { label:"% ahorro global", value: (s.pctAhorro===null? "—" : s.pctAhorro.toFixed(1)+"%"), foot: "Ahorro sobre valor cotizado" }
    ];
    document.getElementById("savings-kpi-row").innerHTML = tiles.map(function(t){
      return '<div class="kpi">'+
        '<span class="label">'+escapeHtml(t.label)+'</span>'+
        '<span class="value">'+t.value+'</span>'+
        '<span class="foot">'+escapeHtml(t.foot)+'</span>'+
      '</div>';
    }).join("");
    var note = document.getElementById("savings-methodology-note");
    if (s.outliersN > 0){
      note.hidden = false;
      note.textContent = "Metodología: se excluye"+(s.outliersN>1?"n "+s.outliersN+" registros":" 1 registro")+" de «valor cotizado» por ser incoherente frente al valor de compra (posible error de digitación) — no afecta el valor de compra reportado, solo el cálculo de ahorro.";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }

  function renderComplianceGauge(recsBase){
    var comp = computeCompliance(recsBase);
    var pct = comp.pct || 0;
    var color = comp.pct===null ? "var(--muted)" : (pct>=80? "var(--good)" : (pct>=50? "var(--warning)":"var(--critical)"));
    var size=180, stroke=16, r=(size-stroke)/2, c=2*Math.PI*r;
    var offset = c - (c*Math.min(100,pct)/100);
    var svg = svgEl("svg",{viewBox:"0 0 "+size+" "+size, width:size, height:size, role:"img", "aria-label":"Cumplimiento de entregas"});
    svg.appendChild(svgEl("circle",{cx:size/2,cy:size/2,r:r,fill:"none",stroke:"var(--grid)","stroke-width":stroke}));
    var fg = svgEl("circle",{cx:size/2,cy:size/2,r:r,fill:"none",stroke:color,"stroke-width":stroke,"stroke-linecap":"round","stroke-dasharray":c,"stroke-dashoffset":offset});
    fg.setAttribute("transform","rotate(-90 "+(size/2)+" "+(size/2)+")");
    svg.appendChild(fg);

    var wrap = document.getElementById("savings-gauge");
    wrap.innerHTML = "";
    var ring = document.createElement("div");
    ring.className = "gauge-ring";
    ring.appendChild(svg);
    var val = document.createElement("div");
    val.className = "gauge-value";
    val.textContent = comp.pct===null ? "—" : comp.pct.toFixed(0)+"%";
    ring.appendChild(val);
    wrap.appendChild(ring);
    var foot = document.createElement("div");
    foot.className = "gauge-foot";
    foot.textContent = comp.total ? (comp.ok+" de "+comp.total+" compras entregadas dentro de 8 días hábiles") : "Sin compras con fecha de entrega registrada";
    wrap.appendChild(foot);

    if (comp.total){
      var noCumplio = comp.total - comp.ok;
      var breakdown = [
        { name:"Cumplió", count: comp.ok, color:"var(--good)" },
        { name:"No cumplió", count: noCumplio, color:"var(--critical)" }
      ];
      var maxC = Math.max.apply(null, breakdown.map(function(b){return b.count;}).concat([1]));
      var bwrap = document.createElement("div");
      bwrap.className = "gauge-breakdown";
      bwrap.innerHTML = breakdown.map(function(b){
        var barPct = b.count/maxC*100;
        var sharePct = (b.count/comp.total*100).toFixed(0)+"%";
        return '<div class="estado-row">'+
          '<span class="name" style="color:'+b.color+'">'+b.name+'</span>'+
          '<div class="track"><div class="fill" style="width:'+barPct+'%; background:'+b.color+';"></div></div>'+
          '<span class="figs"><span class="n">'+b.count+'</span><span class="c">'+sharePct+'</span></span>'+
        '</div>';
      }).join("");
      wrap.appendChild(bwrap);
    }
  }

  function renderExecutiveSummary(s){
    var items = [];
    items.push(detailItem("Total ejecutado", fmtCOP(s.totalEjecutado)) +
      '<div class="dcap">'+s.ejecutadosN+' compras en estado «Ejecutado».</div>');
    items.push(detailItem("Ahorro generado", fmtCOP(s.ahorroTotal)) +
      '<div class="dcap">Equivale a un '+(s.pctAhorro===null?"—":s.pctAhorro.toFixed(1)+"%")+' sobre lo cotizado.</div>');
    if (s.mayorAhorro){
      items.push(detailItem("Mayor ahorro individual", fmtCOP(s.mayorAhorro.ahorro)) +
        '<div class="dcap">'+escapeHtml(s.mayorAhorro.r.descripcion||"—")+' · '+escapeHtml(s.mayorAhorro.r.proveedor||"—")+'</div>');
    } else {
      items.push(detailItem("Mayor ahorro individual", "") + '<div class="dcap">Sin cotizaciones comparables registradas.</div>');
    }
    if (s.areaTop){
      items.push(detailItem("Área con mayor compra", escapeHtml(s.areaTop.area)) +
        '<div class="dcap">'+fmtCOP(s.areaTop.valor)+' · '+s.areaTop.count+' solicitud(es).</div>');
    }
    items.push(detailItem("Compras totales", fmtNum(s.n)) +
      '<div class="dcap">Solicitudes activas registradas en el período cargado.</div>');
    document.getElementById("savings-summary").innerHTML = items.map(function(h){
      return '<div class="detail-item">'+h+'</div>';
    }).join("");
  }

  /* ================= Compras y ahorro por área ================= */
  // Ahorro por área = valor cotizado (compras con cotización comparable, sin outliers)
  // menos el valor comprado de TODA el área (incluidas las compras sin cotización,
  // que así quedan penalizadas con ahorro 0/negativo — ver nota de calidad de dato).
  function computeAreaStats(recs){
    var areas = {};
    recs.forEach(function(r){
      var a = r.area || "Sin área";
      if (!areas[a]) areas[a] = { area:a, count:0, valor:0, cotizadoValor:0, cotizadosN:0 };
      areas[a].count++;
      areas[a].valor += (r.valorConIva||0);
    });
    recs.forEach(function(r){
      if (r.valorCot===null || r.valorCot===undefined || r.valorCot<=0) return;
      if (r.valorConIva && r.valorCot > r.valorConIva*20) return; // excluye outliers de digitación
      var a = r.area || "Sin área";
      if (!areas[a]) return;
      areas[a].cotizadoValor += r.valorCot;
      areas[a].cotizadosN++;
    });
    return Object.keys(areas).map(function(k){
      var x = areas[k];
      var ahorro = x.cotizadoValor - x.valor;
      var pct = x.cotizadoValor > 0 ? (ahorro/x.cotizadoValor*100) : 0;
      return {
        area: x.area, count: x.count, valor: x.valor,
        cotizadoValor: x.cotizadoValor, ahorro: ahorro, pct: pct,
        cotizadosN: x.cotizadosN, sinCotizN: x.count - x.cotizadosN
      };
    });
  }
  function ahorroSpan(val, isPct){
    var cls = val > 0 ? "good" : (val < 0 ? "critical" : "");
    var text = isPct ? (esDecimal(val,1)+"%") : fmtCOP(val);
    return cls ? '<span style="color:var(--'+cls+')">'+text+'</span>' : text;
  }
  function renderAreaComprasCard(prefix, stats){
    var rows = stats.slice().sort(function(a,b){ return b.valor-a.valor; });
    var totalValor = rows.reduce(function(a,r){return a+r.valor;},0);
    var colors = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)"];
    var maxVal = Math.max.apply(null, rows.map(function(r){return r.valor;}).concat([1]));
    var barsEl = document.getElementById(prefix+"-area-compras-bars");
    if (barsEl){
      barsEl.innerHTML = rows.length ? rows.map(function(r, i){
        var pct = r.valor/maxVal*100;
        var color = colors[i] || "var(--sOther)";
        return '<div class="estado-row">'+
          '<span class="name" style="color:'+color+'">'+escapeHtml(r.area)+'</span>'+
          '<div class="track"><div class="fill" style="width:'+pct+'%; background:'+color+';"></div></div>'+
          '<span class="figs"><span class="n">'+fmtCOP(r.valor)+'</span></span>'+
        '</div>';
      }).join("") : '<div class="empty">Sin datos.</div>';
    }
    var body;
    if (!rows.length){
      body = '<tr><td colspan="4" class="empty">Sin datos de áreas.</td></tr>';
    } else {
      body = rows.map(function(r){
        var share = totalValor ? (r.valor/totalValor*100) : 0;
        return '<tr>'+
          '<td>'+escapeHtml(r.area)+'</td>'+
          '<td class="num">'+fmtNum(r.count)+'</td>'+
          '<td class="num">'+fmtCOP(r.valor)+'</td>'+
          '<td class="num">'+esDecimal(share,1)+'%</td>'+
        '</tr>';
      }).join("");
      var totalCount = rows.reduce(function(a,r){return a+r.count;},0);
      body += '<tr class="total-row"><td>Total</td>'+
        '<td class="num">'+fmtNum(totalCount)+'</td>'+
        '<td class="num">'+fmtCOP(totalValor)+'</td>'+
        '<td class="num">'+esDecimal(100,1)+'%</td></tr>';
    }
    var tbody = document.querySelector("#"+prefix+"-area-compras-table tbody");
    if (tbody) tbody.innerHTML = body;
  }
  function renderAreaAhorroCard(prefix, stats){
    var rows = stats.slice().sort(function(a,b){ return b.ahorro-a.ahorro; });
    var maxAhorro = Math.max.apply(null, rows.map(function(r){return Math.max(0,r.ahorro);}).concat([1]));
    var barsEl = document.getElementById(prefix+"-area-ahorro-bars");
    if (barsEl){
      barsEl.innerHTML = rows.length ? rows.map(function(r){
        var w = Math.max(0,r.ahorro)/maxAhorro*100;
        var color = r.ahorro >= 0 ? "var(--good)" : "var(--critical)";
        return '<div class="estado-row">'+
          '<span class="name">'+escapeHtml(r.area)+'</span>'+
          '<div class="track"><div class="fill" style="width:'+w+'%; background:'+color+';"></div></div>'+
          '<span class="figs"><span class="n">'+fmtCOP(Math.max(0,r.ahorro))+'</span></span>'+
        '</div>';
      }).join("") : '<div class="empty">Sin datos.</div>';
    }
    var body;
    if (!rows.length){
      body = '<tr><td colspan="6" class="empty">Sin datos de áreas.</td></tr>';
    } else {
      body = rows.map(function(r){
        return '<tr>'+
          '<td>'+escapeHtml(r.area)+'</td>'+
          '<td class="num">'+fmtCOP(r.cotizadoValor)+'</td>'+
          '<td class="num">'+fmtCOP(r.valor)+'</td>'+
          '<td class="num">'+ahorroSpan(r.ahorro)+'</td>'+
          '<td class="num">'+ahorroSpan(r.pct,true)+'</td>'+
          '<td class="num">'+r.sinCotizN+'/'+r.count+'</td>'+
        '</tr>';
      }).join("");
      var t = rows.reduce(function(a,r){
        a.cotizadoValor+=r.cotizadoValor; a.valor+=r.valor; a.sinCotizN+=r.sinCotizN; a.count+=r.count;
        return a;
      }, {cotizadoValor:0, valor:0, sinCotizN:0, count:0});
      var totalAhorro = t.cotizadoValor - t.valor;
      var totalPct = t.cotizadoValor>0 ? (totalAhorro/t.cotizadoValor*100) : 0;
      body += '<tr class="total-row"><td>Total</td>'+
        '<td class="num">'+fmtCOP(t.cotizadoValor)+'</td>'+
        '<td class="num">'+fmtCOP(t.valor)+'</td>'+
        '<td class="num">'+ahorroSpan(totalAhorro)+'</td>'+
        '<td class="num">'+ahorroSpan(totalPct,true)+'</td>'+
        '<td class="num">'+t.sinCotizN+'/'+t.count+'</td></tr>';
    }
    var tbody = document.querySelector("#"+prefix+"-area-ahorro-table tbody");
    if (tbody) tbody.innerHTML = body;
  }
  function renderAreaQualityNote(prefix, stats){
    var el = document.getElementById(prefix+"-area-quality-note");
    if (!el) return;
    var totalCount = stats.reduce(function(a,s){return a+s.count;},0);
    var totalSin = stats.reduce(function(a,s){return a+s.sinCotizN;},0);
    if (!totalCount){ el.innerHTML = ""; return; }
    if (!totalSin){
      el.innerHTML = '<strong>Nota de calidad de dato:</strong> todas las compras activas del período cuentan con una cotización comparable registrada.';
      return;
    }
    var pct = esDecimal(totalSin/totalCount*100, 1);
    var negativas = stats.filter(function(s){ return s.ahorro < 0; }).map(function(s){return s.area;}).sort();
    var areasTxt = "";
    if (negativas.length === 1) areasTxt = negativas[0];
    else if (negativas.length > 1) areasTxt = negativas.slice(0,-1).join(", ") + " y " + negativas[negativas.length-1];
    el.innerHTML = '<strong>Nota de calidad de dato:</strong> '+totalSin+' de '+totalCount+' compras ('+pct+'%) no tienen una cotización previa registrada; en esas compras el ahorro se calcula como 0 (o negativo si el valor pagado se compara contra una cotización parcial)'+
      (areasTxt ? ', lo que subestima el ahorro real de áreas como '+escapeHtml(areasTxt)+'.' : '.') +
      ' Se recomienda exigir cotización de respaldo para elevar la confiabilidad del indicador de ahorro.';
  }
  function renderAreaSection(prefix, recs){
    var stats = computeAreaStats(recs);
    renderAreaComprasCard(prefix, stats);
    renderAreaAhorroCard(prefix, stats);
    renderAreaQualityNote(prefix, stats);
  }

  function renderTopProveedores(s){
    var totalAll = s.totalCompras;
    var body = !s.topProveedores.length
      ? '<tr><td colspan="5" class="empty">Sin proveedores registrados.</td></tr>'
      : s.topProveedores.map(function(p, i){
          var pct = totalAll ? (p.valor/totalAll*100) : null;
          return '<tr>'+
            '<td class="rank">'+(i+1)+'</td>'+
            '<td>'+escapeHtml(p.proveedor)+'</td>'+
            '<td class="num">'+p.count+'</td>'+
            '<td class="num">'+fmtCOP(p.valor)+'</td>'+
            '<td class="num">'+(pct===null?"—":pct.toFixed(1)+"%")+'</td>'+
          '</tr>';
        }).join("");
    document.querySelector("#savings-proveedores-table tbody").innerHTML = body;
  }

  /* ================= Compras por responsable ================= */
  function computeResponsableStats(recs){
    var by = {};
    recs.forEach(function(r){
      var p = r.responsable || "Sin responsable";
      if (!by[p]) by[p] = { responsable:p, total:0, Ejecutado:0, Proceso:0, Anulado:0, valor:0 };
      by[p].total++;
      if (r.estado === "Ejecutado" || r.estado === "Proceso" || r.estado === "Anulado") by[p][r.estado]++;
      by[p].valor += (r.valorConIva||0);
    });
    return Object.keys(by).map(function(k){ return by[k]; }).sort(function(a,b){ return b.total-a.total; });
  }
  function renderResponsableTable(tableSelector, recs){
    var rows = computeResponsableStats(recs);
    var body;
    if (!rows.length){
      body = '<tr><td colspan="6" class="empty">Sin datos de responsables.</td></tr>';
    } else {
      body = rows.map(function(r){
        return '<tr>'+
          '<td>'+escapeHtml(r.responsable)+'</td>'+
          '<td class="num">'+fmtNum(r.Ejecutado)+'</td>'+
          '<td class="num">'+fmtNum(r.Proceso)+'</td>'+
          '<td class="num">'+fmtNum(r.Anulado)+'</td>'+
          '<td class="num">'+fmtNum(r.total)+'</td>'+
          '<td class="num">'+fmtCOP(r.valor)+'</td>'+
        '</tr>';
      }).join("");
      var t = rows.reduce(function(a,r){
        a.total+=r.total; a.Ejecutado+=r.Ejecutado; a.Proceso+=r.Proceso; a.Anulado+=r.Anulado; a.valor+=r.valor;
        return a;
      }, {total:0,Ejecutado:0,Proceso:0,Anulado:0,valor:0});
      body += '<tr class="total-row"><td>Total</td>'+
        '<td class="num">'+fmtNum(t.Ejecutado)+'</td>'+
        '<td class="num">'+fmtNum(t.Proceso)+'</td>'+
        '<td class="num">'+fmtNum(t.Anulado)+'</td>'+
        '<td class="num">'+fmtNum(t.total)+'</td>'+
        '<td class="num">'+fmtCOP(t.valor)+'</td></tr>';
    }
    var tbody = document.querySelector(tableSelector+" tbody");
    if (tbody) tbody.innerHTML = body;
  }

  /* ================= Consumo por categoría y área ================= */
  function computeAreaCategoryStats(recs){
    var areas = {};
    recs.forEach(function(r){
      var a = r.area || "Sin área";
      var c = r.categoria || "Sin categoría";
      if (!areas[a]) areas[a] = { area:a, total:0, count:0, cats:{} };
      areas[a].total += (r.valorConIva||0);
      areas[a].count++;
      if (!areas[a].cats[c]) areas[a].cats[c] = { categoria:c, valor:0, count:0 };
      areas[a].cats[c].valor += (r.valorConIva||0);
      areas[a].cats[c].count++;
    });
    return Object.keys(areas).map(function(k){
      var x = areas[k];
      var catList = Object.keys(x.cats).map(function(ck){ return x.cats[ck]; })
        .sort(function(a,b){ return b.valor-a.valor; });
      return { area:x.area, total:x.total, count:x.count, cats:catList };
    }).sort(function(a,b){ return b.total-a.total; });
  }
  function renderAreaCategoryTable(tableSelector, recs){
    var stats = computeAreaCategoryStats(recs);
    var TOP_N = 4;
    var body;
    if (!stats.length){
      body = '<tr><td colspan="4" class="empty">Sin datos de áreas.</td></tr>';
    } else {
      body = stats.map(function(x){
        var top = x.cats.slice(0, TOP_N);
        var rest = x.cats.length - top.length;
        var catsHtml = top.map(function(c){
          var pct = x.total ? (c.valor/x.total*100) : 0;
          return '<div class="cat-line"><span class="cat-name">'+escapeHtml(c.categoria)+'</span> '+
            '<span class="cat-figs">— '+fmtCOP(c.valor)+' ('+esDecimal(pct,1)+'%)</span></div>';
        }).join("") + (rest>0 ? '<div class="cat-more">+'+rest+' categoría(s) más</div>' : "");
        return '<tr>'+
          '<td>'+escapeHtml(x.area)+'</td>'+
          '<td class="num">'+fmtNum(x.count)+'</td>'+
          '<td class="num">'+fmtCOP(x.total)+'</td>'+
          '<td class="cat-cell">'+catsHtml+'</td>'+
        '</tr>';
      }).join("");
      var totalAll = stats.reduce(function(a,x){return a+x.total;},0);
      var totalCount = stats.reduce(function(a,x){return a+x.count;},0);
      body += '<tr class="total-row"><td>Total</td>'+
        '<td class="num">'+fmtNum(totalCount)+'</td>'+
        '<td class="num">'+fmtCOP(totalAll)+'</td>'+
        '<td></td></tr>';
    }
    var tbody = document.querySelector(tableSelector+" tbody");
    if (tbody) tbody.innerHTML = body;
  }

  function renderSavingsTab(){
    populateSavingsYearOptions();
    populateSavingsMonthOptions();
    renderKPIs();
    renderPendingTop();
    renderMonthChart();
    renderAreaMonthChart();
    renderEstadoChart();
    renderComplianceSection();
    renderMedioChart();
    var recs = savingsRecords();
    var s = computeSavings(recs);
    renderSavingsKPIs(s);
    renderComplianceGauge(recs);
    renderExecutiveSummary(s);
    renderAreaSection("savings", recs.filter(function(r){ return r.estado !== "Anulado"; }));
    renderTopProveedores(s);
    renderResponsableTable("#savings-responsable-table", recs);
    renderAreaCategoryTable("#savings-catarea-table", recs.filter(function(r){ return r.estado !== "Anulado"; }));
  }

  /* ================= Top: solicitudes pendientes (sin estado o en proceso) ================= */
  function renderPendingTop(){
    var candidates = savingsRecords().filter(function(r){
      return (!r.estado || r.estado === "Proceso" || r.estado === "Pendiente") && r.fechaSolicitud && !r.fechaEntrega;
    });
    var withElapsed = candidates.map(function(r){
      return { r: r, elapsed: businessDaysElapsedToToday(r.fechaSolicitud) };
    }).sort(function(a,b){ return (b.elapsed||0) - (a.elapsed||0); });

    var container = document.getElementById("pending-top-list");
    if (!withElapsed.length){
      container.innerHTML = '<div class="empty" style="padding:18px 0 6px;">No hay solicitudes pendientes sin estado o en proceso.</div>';
      return;
    }
    var rows = withElapsed.map(function(x, i){
      var sev = x.elapsed > 8 ? "critical" : (x.elapsed > 0 ? "warning" : "muted");
      return '<tr class="clickable" data-id="'+x.r.id+'">'+
        '<td class="rank mono">'+(i+1)+'</td>'+
        '<td>'+escapeHtml(x.r.descripcion||"—")+'</td>'+
        '<td>'+escapeHtml(x.r.area||"—")+'</td>'+
        '<td>'+escapeHtml(x.r.responsable||"—")+'</td>'+
        '<td class="mono">'+fmtDateDisplay(x.r.fechaSolicitud)+'</td>'+
        '<td><span class="pill '+sev+'">'+x.elapsed+' d</span></td>'+
        '<td>'+estadoPill(x.r.estado)+'</td>'+
      '</tr>';
    }).join("");
    container.innerHTML = '<div class="offenders scroll-x"><table>'+
      '<thead><tr><th>#</th><th>Descripción</th><th>Área</th><th>Responsable</th><th>F. solicitud</th><th>Días</th><th>Estado de compra</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
    container.querySelectorAll("tr[data-id]").forEach(function(tr){
      tr.addEventListener("click", function(){ openDetailModal(tr.getAttribute("data-id")); });
    });
  }

  /* ================= Registros: filter/sort/paginate ================= */
  var tableState = { sortKey: "fechaSolicitud", sortDir: "desc", page: 1, pageSize: 50 };

  function populateFilterOptions(){
    var areas = Array.from(new Set(activeRecords().map(function(r){return r.area;}).filter(Boolean))).sort();
    var estados = Array.from(new Set(activeRecords().map(function(r){return r.estado;}).filter(Boolean))).sort();
    var medios = Array.from(new Set(activeRecords().map(function(r){return r.medioPago;}).filter(Boolean))).sort();
    var licitaciones = Array.from(new Set(activeRecords().map(function(r){return r.licitacion;}).filter(Boolean).map(String))).sort(function(a,b){
      return a.localeCompare(b, undefined, {numeric:true});
    });
    fillSelect("f-area", areas);
    fillSelect("f-estado", estados);
    fillSelect("f-medio", medios);
    fillSelect("f-licitacion", licitaciones);
    fillDatalist("dl-area", areas);
    fillDatalist("dl-responsable", Array.from(new Set(activeRecords().map(function(r){return r.responsable;}).filter(Boolean))).sort());
    fillDatalist("dl-categoria", Array.from(new Set(activeRecords().map(function(r){return r.categoria;}).filter(Boolean))).sort());
    fillDatalist("dl-proveedor", Array.from(new Set(activeRecords().map(function(r){return r.proveedor;}).filter(Boolean))).sort());
    fillDatalist("dl-informe", ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]);
  }
  function fillSelect(id, values){
    var el = document.getElementById(id);
    var current = el.value;
    el.innerHTML = '<option value="">Todas</option>' + values.map(function(v){ return '<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>'; }).join("");
    el.value = current;
  }
  function fillDatalist(id, values){
    document.getElementById(id).innerHTML = values.map(function(v){ return '<option value="'+escapeHtml(v)+'">'; }).join("");
  }

  function filteredRecords(){
    var q = document.getElementById("f-search").value.trim().toLowerCase();
    var area = document.getElementById("f-area").value;
    var estado = document.getElementById("f-estado").value;
    var medio = document.getElementById("f-medio").value;
    var licitacion = document.getElementById("f-licitacion").value;
    var desde = document.getElementById("f-desde").value;
    var hasta = document.getElementById("f-hasta").value;
    return activeRecords().filter(function(r){
      if (area && r.area !== area) return false;
      if (estado && r.estado !== estado) return false;
      if (medio && r.medioPago !== medio) return false;
      if (licitacion && String(r.licitacion==null?"":r.licitacion) !== licitacion) return false;
      if (desde && (!r.fechaSolicitud || r.fechaSolicitud < desde)) return false;
      if (hasta && (!r.fechaSolicitud || r.fechaSolicitud > hasta)) return false;
      if (q){
        var hay = [r.descripcion, r.proveedor, r.responsable, r.categoria, r.observaciones].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortRecords(recs){
    var key = tableState.sortKey, dir = tableState.sortDir === "asc" ? 1 : -1;
    return recs.slice().sort(function(a,b){
      var av, bv;
      if (key === "dias"){
        av = businessDaysBetween(a.fechaSolicitud, a.fechaEntrega); av = av===null? -1 : av;
        bv = businessDaysBetween(b.fechaSolicitud, b.fechaEntrega); bv = bv===null? -1 : bv;
      } else if (key === "valorConIva"){
        av = a.valorConIva||0; bv = b.valorConIva||0;
      } else {
        av = (a[key]||""); bv = (b[key]||"");
      }
      if (av < bv) return -1*dir;
      if (av > bv) return 1*dir;
      return 0;
    });
  }

  function renderTable(){
    populateFilterOptions();
    var recs = sortRecords(filteredRecords());
    var total = recs.length;
    var pageSize = tableState.pageSize;
    var pages = Math.max(1, Math.ceil(total/pageSize));
    if (tableState.page > pages) tableState.page = pages;
    var start = (tableState.page-1)*pageSize;
    var pageRecs = recs.slice(start, start+pageSize);

    document.querySelectorAll("table.records thead th[data-key]").forEach(function(th){
      var k = th.getAttribute("data-key");
      th.classList.toggle("sorted", k === tableState.sortKey);
      var arrow = th.querySelector(".arrow");
      if (k === tableState.sortKey) arrow.textContent = tableState.sortDir === "asc" ? "↑" : "↓";
      else arrow.textContent = "↕";
    });

    var body = document.getElementById("records-body");
    if (!pageRecs.length){
      body.innerHTML = '<tr><td colspan="19"><div class="empty">No hay registros que coincidan con los filtros.</div></td></tr>';
    } else {
      body.innerHTML = pageRecs.map(function(r){
        var dias = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
        var diasHtml;
        if (r.fechaEntrega){
          var over = dias !== null && dias > 8;
          diasHtml = '<span class="pill '+(over?"critical":"good")+'">'+dias+' d</span>';
        } else {
          var elapsed = businessDaysElapsedToToday(r.fechaSolicitud);
          var risky = elapsed !== null && elapsed > 8 && r.estado !== "Anulado";
          diasHtml = '<span class="pill '+(risky?"warning":"muted")+'">'+(elapsed===null?"—":elapsed+" d")+' · pend.</span>';
        }
        var td = function(v){ return '<td class="truncate" title="'+escapeHtml(v||"")+'">'+escapeHtml(v||"—")+'</td>'; };
        return '<tr data-id="'+r.id+'">'+
          '<td class="mono">'+fmtDateDisplay(r.fechaSolicitud)+'</td>'+
          '<td class="mono">'+(r.fechaEntrega? fmtDateDisplay(r.fechaEntrega) : '<span class="pill muted">Pendiente</span>')+'</td>'+
          '<td>'+diasHtml+'</td>'+
          '<td>'+escapeHtml(r.area||"—")+'</td>'+
          '<td>'+escapeHtml(r.responsable||"—")+'</td>'+
          '<td>'+estadoPill(r.estado)+'</td>'+
          td(r.categoria) +
          '<td class="desc-cell truncate wide" title="'+escapeHtml(r.descripcion||"")+'">'+escapeHtml(r.descripcion||"—")+'</td>'+
          '<td>'+escapeHtml(r.medioPago||"—")+'</td>'+
          '<td>'+escapeHtml(r.licitacion||"—")+'</td>'+
          '<td>'+(r.estadoLegalizacion? '<span class="pill '+legalizacionClass(r.estadoLegalizacion)+'">'+escapeHtml(r.estadoLegalizacion)+'</span>' : '—')+'</td>'+
          td(r.proveedor) +
          '<td class="mono">'+escapeHtml(r.fe||"—")+'</td>'+
          '<td class="num mono">'+fmtPesos(r.valorConIva)+'</td>'+
          '<td class="num mono">'+(r.valorSinIva!=null? fmtPesos(r.valorSinIva) : "—")+'</td>'+
          '<td class="num mono">'+(r.valorCot!=null? fmtPesos(r.valorCot) : "—")+'</td>'+
          '<td class="check-col"><button class="btn-check'+(r.radicado?" checked":"")+'" type="button" data-radicado="'+r.id+'" title="'+(r.radicado?"Radicado":"Marcar como radicado")+'" aria-pressed="'+(r.radicado?"true":"false")+'">✓</button></td>'+
          td(r.observaciones) +
          '<td class="actions-cell"><div class="cell-flex"><div class="row-actions" data-actions></div></div></td>'+
        '</tr>';
      }).join("");
      pageRecs.forEach(function(r){
        var tr = body.querySelector('tr[data-id="'+r.id+'"]');
        var actionsCell = tr.querySelector('[data-actions]');
        renderRowActions(actionsCell, r.id);
        var radBtn = tr.querySelector('[data-radicado]');
        if (radBtn) radBtn.addEventListener("click", function(e){ toggleRadicado(r.id, e.currentTarget); });
      });
    }
    document.getElementById("count-note").textContent = total + " registro(s)" + (total!==activeRecords().length? " (filtrado de "+activeRecords().length+")":"");
    document.getElementById("page-indicator").textContent = "Página " + tableState.page + " de " + pages;
  }

  function renderRowActions(cell, id){
    cell.innerHTML = '<button class="btn btn-ghost small icon-btn" data-act="edit" title="Editar registro" aria-label="Editar registro">✏️</button>'+
      '<button class="btn btn-ghost small icon-btn btn-danger-text" data-act="del" title="Eliminar registro" aria-label="Eliminar registro">🗑️</button>';
    cell.querySelector('[data-act="edit"]').addEventListener("click", function(){ openModal(id); });
    cell.querySelector('[data-act="del"]').addEventListener("click", function(){
      cell.innerHTML = '<span class="confirm-del">¿Eliminar? '+
        '<button class="btn small btn-danger-text" data-act="yes">Sí</button>'+
        '<button class="btn small" data-act="no">No</button></span>';
      cell.querySelector('[data-act="yes"]').addEventListener("click", function(e){ deleteRecord(id, e.currentTarget); });
      cell.querySelector('[data-act="no"]').addEventListener("click", function(){ renderRowActions(cell, id); });
    });
  }

  function fmtDateDisplay(iso){
    if (!iso) return "—";
    var d = parseISODate(iso);
    return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
  }

  function deleteRecord(id, btn){
    withButtonLoading(btn, function(){ return apiDeleteRecord(id); }, { loadingLabel:"Eliminando…", successMessage:"Registro eliminado" }).then(function(){
      STATE.records = STATE.records.filter(function(r){ return r.id !== id; });
      persist();
    }).catch(function(err){
      if (err.message !== "busy") alert(err.message || "No se pudo eliminar el registro en la base de datos.");
    });
  }

  function toggleRadicado(id, btn){
    var rec = STATE.records.find(function(x){ return x.id === id; });
    if (!rec) return;
    var payload = Object.assign({}, rec, { radicado: !rec.radicado });
    withButtonLoading(btn, function(){ return apiUpdateRecord(id, payload); }, { loadingLabel:"", successMessage:false }).then(function(saved){
      var idx = STATE.records.findIndex(function(x){ return x.id === id; });
      if (idx !== -1) STATE.records[idx] = saved;
      persist();
      renderTable();
    }).catch(function(err){
      if (err.message !== "busy") alert(err.message || "No se pudo actualizar el registro en la base de datos.");
    });
  }

  /* ================= Sorting via header click ================= */
  document.querySelectorAll("table.records thead th[data-key]").forEach(function(th){
    th.addEventListener("click", function(){
      var k = th.getAttribute("data-key");
      if (tableState.sortKey === k){
        tableState.sortDir = tableState.sortDir === "asc" ? "desc" : "asc";
      } else {
        tableState.sortKey = k;
        tableState.sortDir = "asc";
      }
      tableState.page = 1;
      renderTable();
    });
  });

  ["f-search","f-area","f-estado","f-medio","f-licitacion","f-desde","f-hasta"].forEach(function(id){
    document.getElementById(id).addEventListener("input", function(){ tableState.page=1; renderTable(); });
    document.getElementById(id).addEventListener("change", function(){ tableState.page=1; renderTable(); });
  });
  document.getElementById("btn-clear-filters").addEventListener("click", function(){
    ["f-search","f-area","f-estado","f-medio","f-licitacion","f-desde","f-hasta"].forEach(function(id){ document.getElementById(id).value = ""; });
    tableState.page = 1;
    renderTable();
  });
  document.getElementById("page-size").addEventListener("change", function(e){
    tableState.pageSize = parseInt(e.target.value,10);
    tableState.page = 1;
    renderTable();
  });
  document.getElementById("page-prev").addEventListener("click", function(){
    if (tableState.page>1){ tableState.page--; renderTable(); }
  });
  document.getElementById("page-next").addEventListener("click", function(){
    tableState.page++; renderTable();
  });

  /* ================= Modal (add/edit) ================= */
  var modalOverlay = document.getElementById("modal-overlay");
  var editingId = null;
  function renderModalDeleteControl(){
    var wrap = document.getElementById("modal-delete-wrap");
    if (!editingId){
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = '<button class="btn small btn-danger-outline" id="modal-delete-btn" type="button">🗑 Eliminar registro</button>';
    document.getElementById("modal-delete-btn").addEventListener("click", function(){
      wrap.innerHTML = '<span class="confirm-del">¿Eliminar este registro? '+
        '<button class="btn small btn-danger-solid" id="modal-delete-yes" type="button">Sí, eliminar</button>'+
        '<button class="btn small" id="modal-delete-no" type="button">No</button></span>';
      document.getElementById("modal-delete-yes").addEventListener("click", function(){
        var id = editingId;
        closeModal();
        deleteRecord(id);
      });
      document.getElementById("modal-delete-no").addEventListener("click", renderModalDeleteControl);
    });
  }
  function openModal(id){
    editingId = id || null;
    var r = id ? STATE.records.find(function(x){return x.id===id;}) : null;
    document.getElementById("modal-title").textContent = id ? "Editar registro" : "Agregar registro";
    document.getElementById("modal-id-note").textContent = id ? ("ID "+id) : "";
    var fields = ["fechaSolicitud","fechaEntrega","area","responsable","estado","categoria","informe","descripcion","medioPago","proveedor","licitacion","estadoLegalizacion","fe","valorConIva","valorSinIva","valorCot","observaciones"];
    fields.forEach(function(f){
      var el = document.getElementById("m-"+f);
      el.value = r ? (r[f]!==null && r[f]!==undefined ? r[f] : "") : (f==="estado" ? "Proceso" : "");
    });
    document.getElementById("modal-error").hidden = true;
    renderModalDeleteControl();
    updateDiasPreview();
    modalOverlay.hidden = false;
    document.getElementById("m-fechaSolicitud").focus();
  }
  function closeModal(){ modalOverlay.hidden = true; editingId = null; }
  document.getElementById("btn-add").addEventListener("click", function(){ openModal(null); });
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function(e){ if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !modalOverlay.hidden) closeModal(); });

  /* ================= Detail modal (read-only, view-only info) ================= */
  var detailModalOverlay = document.getElementById("detail-modal-overlay");
  function detailItem(label, value, opts){
    opts = opts || {};
    var cls = "dvalue" + (opts.mono ? " mono" : "") + (value ? "" : " empty-val");
    return '<div class="detail-item'+(opts.full?" full":"")+'">'+
      '<div class="dlabel">'+escapeHtml(label)+'</div>'+
      '<div class="'+cls+'">'+(value!=null && value!=="" ? value : "—")+'</div>'+
    '</div>';
  }
  function renderDetailModal(r){
    var dias = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
    var diasHtml;
    if (r.fechaEntrega){
      var over = dias !== null && dias > 8;
      diasHtml = '<span class="pill '+(over?"critical":"good")+'">'+dias+' d hábiles</span>';
    } else {
      var elapsed = businessDaysElapsedToToday(r.fechaSolicitud);
      var risky = elapsed !== null && elapsed > 8 && r.estado !== "Anulado";
      diasHtml = '<span class="pill '+(risky?"warning":"muted")+'">'+(elapsed===null?"—":elapsed+" d hábiles")+' · pendiente</span>';
    }
    var html = "";
    html += detailItem("Fecha de solicitud", fmtDateDisplay(r.fechaSolicitud), {mono:true});
    html += detailItem("Fecha de entrega", r.fechaEntrega ? fmtDateDisplay(r.fechaEntrega) : '<span class="pill muted">Pendiente</span>', {mono:true});
    html += detailItem("Días hábiles", diasHtml);
    html += detailItem("Estado de compra", estadoPill(r.estado));
    html += detailItem("Área", escapeHtml(r.area||""));
    html += detailItem("Responsable", escapeHtml(r.responsable||""));
    html += detailItem("Categoría", escapeHtml(r.categoria||""));
    html += detailItem("Medio de pago", escapeHtml(r.medioPago||""));
    html += detailItem("Proveedor", escapeHtml(r.proveedor||""));
    html += detailItem("Licitación", escapeHtml(r.licitacion||""));
    html += detailItem("Estado legalización", r.estadoLegalizacion ? ('<span class="pill '+legalizacionClass(r.estadoLegalizacion)+'">'+escapeHtml(r.estadoLegalizacion)+'</span>') : "");
    html += detailItem("FE / referencia", escapeHtml(r.fe||""), {mono:true});
    html += detailItem("Valor + IVA", fmtPesos(r.valorConIva), {mono:true});
    html += detailItem("Valor sin IVA", r.valorSinIva!=null ? fmtPesos(r.valorSinIva) : "", {mono:true});
    html += detailItem("Valor cotizado", r.valorCot!=null ? fmtPesos(r.valorCot) : "", {mono:true});
    html += detailItem("Descripción", escapeHtml(r.descripcion||""), {full:true});
    html += detailItem("Observaciones", escapeHtml(r.observaciones||""), {full:true});
    html += detailItem("Informe (mes)", escapeHtml(r.informe||""));
    document.getElementById("detail-modal-body").innerHTML = html;
    document.getElementById("detail-modal-id-note").textContent = "ID " + r.id;
  }
  function openDetailModal(id){
    var r = STATE.records.find(function(x){return x.id===id;});
    if (!r) return;
    renderDetailModal(r);
    detailModalOverlay.hidden = false;
  }
  function closeDetailModal(){ detailModalOverlay.hidden = true; }
  document.getElementById("detail-modal-close").addEventListener("click", closeDetailModal);
  document.getElementById("detail-modal-ok").addEventListener("click", closeDetailModal);
  detailModalOverlay.addEventListener("click", function(e){ if (e.target === detailModalOverlay) closeDetailModal(); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !detailModalOverlay.hidden) closeDetailModal(); });

  ["m-fechaSolicitud","m-fechaEntrega"].forEach(function(id){
    document.getElementById(id).addEventListener("change", updateDiasPreview);
  });
  function updateDiasPreview(){
    var s = document.getElementById("m-fechaSolicitud").value;
    var e = document.getElementById("m-fechaEntrega").value;
    var el = document.getElementById("dias-preview");
    if (!s){ el.textContent = ""; return; }
    if (e){
      var d = businessDaysBetween(s,e);
      if (d === null){ el.textContent = "La fecha de entrega debe ser igual o posterior a la solicitud."; return; }
      el.innerHTML = "Días hábiles calculados: <strong>"+d+"</strong>" + (d>8? ' <span class="pill critical">supera el límite de 8</span>' : ' <span class="pill good">dentro del límite</span>');
    } else {
      var el2 = businessDaysElapsedToToday(s);
      el.textContent = el2===null? "" : ("Sin fecha de entrega · "+el2+" día(s) hábil(es) transcurridos");
    }
  }

  document.getElementById("modal-save").addEventListener("click", function(e){
    var saveBtn = e.currentTarget;
    var get = function(f){ return document.getElementById("m-"+f).value.trim(); };
    var fechaSolicitud = get("fechaSolicitud");
    var area = get("area");
    var responsableVal = get("responsable");
    var descripcion = get("descripcion");
    var valorConIva = get("valorConIva");
    var errEl = document.getElementById("modal-error");
    if (!fechaSolicitud || !area || !responsableVal || !descripcion){
      errEl.textContent = "Completa fecha de solicitud, área, responsable y descripción.";
      errEl.hidden = false;
      return;
    }
    var existingRec = editingId ? STATE.records.find(function(x){ return x.id === editingId; }) : null;
    var payload = {
      radicado: existingRec ? !!existingRec.radicado : false,
      fechaSolicitud: fechaSolicitud,
      fechaEntrega: get("fechaEntrega") || null,
      area: area,
      responsable: get("responsable") || null,
      estado: get("estado") || null,
      categoria: get("categoria") || null,
      informe: get("informe") || null,
      descripcion: descripcion,
      medioPago: get("medioPago") || null,
      licitacion: get("licitacion") || null,
      estadoLegalizacion: get("estadoLegalizacion") || null,
      proveedor: get("proveedor") || null,
      fe: get("fe") || null,
      valorConIva: valorConIva ? parseFloat(valorConIva) : null,
      valorSinIva: get("valorSinIva") ? parseFloat(get("valorSinIva")) : null,
      valorCot: get("valorCot") ? parseFloat(get("valorCot")) : null,
      observaciones: get("observaciones") || null
    };
    var savingId = editingId;
    withButtonLoading(saveBtn, function(){
      return savingId ? apiUpdateRecord(savingId, payload) : apiCreateRecord(payload);
    }, { loadingLabel:"Guardando…", successMessage:"Registro guardado" }).then(function(saved){
      if (savingId){
        var idx = STATE.records.findIndex(function(x){ return x.id === savingId; });
        if (idx !== -1) STATE.records[idx] = saved; else STATE.records.push(saved);
      } else {
        STATE.records.push(saved);
      }
      closeModal();
      persist();
    }).catch(function(err){
      if (err.message === "busy") return;
      errEl.textContent = err.message || "No se pudo guardar en la base de datos. Intenta de nuevo.";
      errEl.hidden = false;
    });
  });

  /* ================= Render all ================= */
  function renderAll(){
    if (!viewRegistros.hidden) renderTable();
    if (!viewSavings.hidden) renderSavingsTab();
    document.getElementById("brand-sub").textContent = "Compras · " + activeRecords().length + " registros";
  }

  // Arranque: restaura la pestaña que el usuario tenía activa (ver nota junto a
  // switchTab) y renderiza esa vista; por defecto, "Dashboard de compras".
  switchTab(getStoredTab());
  document.getElementById("brand-sub").textContent = "Compras · " + activeRecords().length + " registros";
})();

