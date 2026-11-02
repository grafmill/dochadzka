/* =====================================================================
   NÁKLADY A VÝSLEDOK ZÁKAZIEK (modul – zapína sa v Nastaveniach) a DVOJSTUPŇOVÉ OVERENIE
   Načíta sa pred hlavným skriptom administrácie. Jeho premenné (C, P, W, sb, q, eur…)
   používa až pri volaní, preto na poradí nezáleží.
   ===================================================================== */
let CC = [], PF = {}, costFlt = {month: null, project: "", unassigned: false};
const costsSql = () => !!C && "costs_enabled" in C;          // spustené SQL 0007
const costsOn = () => costsSql() && C.costs_enabled === true;
const DOC_KIND = {faktura: "Faktúra", blocek: "Bloček", ine: "Iný doklad"};
const PSTATUS = {ponuka: "Ponuka", bezi: "Beží", hotova: "Hotová", fakturovana: "Vyfakturovaná", zaplatena: "Zaplatená"};
// predvolené kategórie podľa zamerania firmy (dajú sa premenovať, skryť, pridať)
const COST_CATS = {
  stavba: ["Materiál", "Spotrebný materiál", "Kooperácie (subdodávky)", "Prenájom techniky a lešenia", "Doprava", "Odvoz odpadu", "Ubytovanie a diéty", "Ostatné"],
  kovo: ["Materiál", "Spojovací a spotrebný materiál", "Pálenie / laser", "Ohýbanie", "Zváranie", "Striekanie / lakovanie", "Zinkovanie", "Obrábanie",
    "Programovanie / CAD", "Kooperácie (subdodávky)", "Montáž", "Doprava", "Ostatné"],
  vseob: ["Materiál", "Spotrebný materiál", "Kooperácie (subdodávky)", "Doprava", "Prenájom techniky", "Ubytovanie a diéty", "Ostatné"]
};

async function loadCosts() {
  CC = []; PF = {};
  if (!costsOn()) return;
  const [cc, pf] = await Promise.all([
    q(sb.from("cost_categories").select("*").eq("company_id", C.id).order("sort").order("name")),
    fetchAll(() => sb.from("project_finance").select("*").eq("company_id", C.id))
  ]);
  CC = cc; PF = Object.fromEntries(pf.map(x => [x.project_id, x]));
}
const catName = id => id ? (CC.find(c => c.id === id)?.name || "?") : "Bez kategórie";
// hodina TPP stojí firmu viac ako sadzba (odvody zamestnávateľa), živnostník len sadzbu
const laborCoef = wid => worker(wid)?.type === "TPP" ? +(C.tpp_coef || 1) : 1;
const laborCost = e => costOf(e) * laborCoef(e.worker_id);
const hrs1 = t => (Math.round(t / 36e5 * 10) / 10).toLocaleString("sk-SK");
const pctTxt = n => (Math.round(n * 10) / 10).toLocaleString("sk-SK") + " %";
const sumBy = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

/* ---------- výsledok zákazky: cena − (doklady + vlastná práca) ---------- */
function projectResult(p, entries, items) {
  const fin = PF[p.id] || {};
  const docs = new Map(), labor = new Map();
  items.forEach(i => docs.set(i.category_id || "", r2((docs.get(i.category_id || "") || 0) + +i.amount)));
  entries.forEach(e => { const o = labor.get(e.task_num) || {ms: 0, cost: 0}; o.ms += workedMs(e); o.cost += laborCost(e); labor.set(e.task_num, o); });
  const docSum = r2(sumBy([...docs.values()], x => x)), laborSum = r2(sumBy([...labor.values()], o => o.cost));
  const cost = r2(docSum + laborSum), price = fin.price != null ? +fin.price : null;
  const profit = price == null ? null : r2(price - cost);
  return {fin, price, docs, labor, docSum, laborSum, cost, profit, pct: price ? profit / price * 100 : null,
    laborMs: sumBy([...labor.values()], o => o.ms)};
}
const resultCls = r => r.profit == null ? "" : r.profit < 0 ? "neg" : r.pct < (C.margin_warn_pct ?? 10) ? "warnc" : "pos";
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "") + eur(Math.abs(n));
// všetky náklady všetkých zákaziek naraz (zoznam zákaziek)
async function loadResults() {
  const [items, ents] = await Promise.all([
    fetchAll(() => sb.from("cost_items").select("project_id,category_id,amount").eq("company_id", C.id).not("project_id", "is", null).order("id")),
    fetchAll(() => sb.from("entries").select("worker_id,project_id,task_num,start_at,end_at,breaks,cont_in,cont_out").eq("company_id", C.id).not("project_id", "is", null).order("start_at"))
  ]);
  const out = {};
  P.forEach(p => out[p.id] = projectResult(p, ents.filter(e => e.project_id === p.id), items.filter(i => i.project_id === p.id)));
  return out;
}
function resultCell(p, r) {
  const st = PF[p.id]?.status;
  if (!r) return "";
  return `${st ? `<span class="tag ${st === "zaplatena" ? "go" : ""}">${PSTATUS[st]}</span><br>` : ""}${r.price == null
    ? `<span class="small muted">náklady ${eur(r.cost)} · cena nezadaná</span>`
    : `<b class="num ${resultCls(r)}">${signed(r.profit)}</b> <span class="small ${resultCls(r)}">${pctTxt(r.pct)}</span><br><span class="small muted">${eur(r.price)} − ${eur(r.cost)}</span>`}`;
}

// karta „Výsledok zákazky“ v detaile zákazky (entries = všetky záznamy dochádzky zákazky)
async function projectResultHtml(p, entries) {
  const items = await fetchAll(() => sb.from("cost_items").select("*").eq("project_id", p.id).order("id"));
  const nDocs = new Set(items.map(i => i.doc_id)).size;
  const r = projectResult(p, entries, items), f = r.fin, cls = resultCls(r);
  const base = Math.max(r.price || 0, r.cost) || 1, w = n => Math.max(0, n / base * 100).toFixed(2) + "%";
  const docRows = [...r.docs.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(catName(k))}</td><td class="r num">${eur(v)}</td></tr>`).join("");
  const labRows = [...r.labor.entries()].sort((a, b) => b[1].cost - a[1].cost)
    .map(([n, o]) => `<tr><td>${n} · ${esc(taskName(n))}<span class="small muted" style="display:block">${hrs1(o.ms)} h</span></td><td class="r num">${eur(o.cost)}</td></tr>`).join("");
  const anyTpp = entries.some(e => worker(e.worker_id)?.type === "TPP") && +C.tpp_coef !== 1;
  return `<section class="card resu">
    <div class="bar"><span class="lbl" style="flex:1">Výsledok zákazky</span>${f.status ? `<span class="tag">${PSTATUS[f.status]}</span>` : ""}${f.due_on ? `<span class="tag">termín ${dFull(f.due_on)}</span>` : ""}</div>
    ${f.customer ? `<div class="muted">Zákazník: <b style="color:var(--ink)">${esc(f.customer)}</b></div>` : ""}
    <div class="eq">
      <div class="k"><div class="lbl">Cena</div><div class="v num">${r.price == null ? "–" : eur(r.price)}</div></div><div class="op">−</div>
      <div class="k"><div class="lbl">Náklady</div><div class="v num">${eur(r.cost)}</div></div><div class="op">=</div>
      <div class="k ${cls}" style="border-color:currentColor"><div class="lbl">${r.profit != null && r.profit < 0 ? "Strata" : "Zisk"}</div><div class="v num">${r.profit == null ? "–" : signed(r.profit)}</div>
        ${r.pct != null ? `<div class="small">${pctTxt(r.pct)} z ceny</div>` : ""}</div>
    </div>
    ${r.price == null ? `<div class="card flag" style="padding:8px 12px">Zákazka nemá predajnú cenu, preto nevidno zisk. <button class="btn sm" data-act="project" data-id="${p.id}">Zadať cenu</button></div>` : ""}
    ${r.cost || r.price ? `<div class="rbar" role="img" aria-label="Doklady ${eur(r.docSum)}, vlastná práca ${eur(r.laborSum)}${r.profit > 0 ? ", zisk " + eur(r.profit) : ""}">
      <span style="width:${w(r.docSum)};background:var(--info)"></span><span style="width:${w(r.laborSum)};background:var(--accent)"></span>${r.profit > 0 ? `<span style="width:${w(r.profit)};background:var(--go)"></span>` : ""}</div>
    <div class="legend"><span><i style="background:var(--info)"></i>Doklady ${eur(r.docSum)}</span><span><i style="background:var(--accent)"></i>Vlastná práca ${eur(r.laborSum)}</span>${r.profit > 0 ? `<span><i style="background:var(--go)"></i>Zisk ${eur(r.profit)}</span>` : ""}</div>` : ""}
    <div class="rtabw rtab"><table><thead><tr><th>Za čo</th><th class="r">Stálo</th></tr></thead><tbody>
      <tr class="grp"><td colspan="2">Materiál a služby zvonku · ${nDocs} ${nDocs === 1 ? "doklad" : nDocs > 1 && nDocs < 5 ? "doklady" : "dokladov"}</td></tr>
      ${docRows || `<tr><td colspan="2" class="muted">Zatiaľ žiadny doklad.</td></tr>`}
      <tr class="sub"><td>Spolu</td><td class="r num">${eur(r.docSum)}</td></tr>
      <tr class="grp"><td colspan="2">Vlastná práca z dochádzky · ${hrs1(r.laborMs)} h</td></tr>
      ${labRows || `<tr><td colspan="2" class="muted">Zatiaľ žiadne hodiny.</td></tr>`}
      <tr class="sub"><td>Spolu${anyTpp ? `<span class="small muted" style="display:block">TPP × ${String(C.tpp_coef).replace(".", ",")} (odvody)</span>` : ""}</td><td class="r num">${eur(r.laborSum)}</td></tr>
    </tbody><tfoot><tr><td>Náklady spolu</td><td class="r num">${eur(r.cost)}</td></tr></tfoot></table></div>
    <div class="bar"><button class="btn accent" data-act="cdoc-new" data-id="${p.id}">+ Náklad k zákazke</button><button class="btn" data-act="cdocs-project" data-id="${p.id}">Doklady zákazky</button><button class="btn" data-act="project" data-id="${p.id}">Cena a zákazník</button></div>
  </section>`;
}

/* ---------- zákazka: zákazník, cena, stav, termín (okno Upraviť zákazku) ---------- */
function financeFieldsHtml(id) {
  if (!costsOn()) return "";
  const f = PF[id] || {status: "bezi"};
  return `<div class="full"><h3 style="margin:4px 0 0">Zákazník a cena</h3></div>
    <div class="field"><label for="pCustomer">Zákazník</label><input id="pCustomer" value="${esc(f.customer || "")}" placeholder="komu sa zákazka robí"></div>
    <div class="field"><label for="pPrice">Predajná cena bez DPH €</label><input id="pPrice" type="number" min="0" step="0.01" value="${f.price ?? ""}"><span class="hint">Z nej sa ráta zisk zákazky</span></div>
    <div class="field"><label for="pStatus">Stav</label><select id="pStatus">${Object.entries(PSTATUS).map(([k, t]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="field"><label for="pDue">Termín</label><input id="pDue" type="date" value="${f.due_on || ""}"></div>`;
}
async function saveFinance(pid, form) {
  if (!costsOn() || !form.pPrice) return;
  const row = {project_id: pid, company_id: C.id, customer: form.pCustomer.value.trim() || null, price: form.pPrice.value === "" ? null : r2(form.pPrice.value),
    status: form.pStatus.value, due_on: form.pDue.value || null};
  PF[pid] = await q(sb.from("project_finance").upsert(row, {onConflict: "project_id"}).select().single());
}

/* ---------- Nastavenia: modul, koeficient, kategórie ---------- */
function costSettingsHtml() {
  if (!costsSql()) return `<div class="full card flag">Náklady a výsledok zákaziek, dvojstupňové overenie: v Supabase treba spustiť SQL súbor 0007_naklady_zakaziek.sql.</div>`;
  return `<div class="full"><h3 style="margin:8px 0 0">Náklady a výsledok zákaziek</h3>
      <label class="check"><input type="checkbox" id="sCosts" ${C.costs_enabled ? "checked" : ""}><div><b>Sledovať náklady a zisk zákaziek</b><span>Pri zákazke sa zadá predajná cena, k nej doklady (faktúry, bločky) a z dochádzky sa sama zaráta práca. Uvidíš, či je zákazka v pluse alebo v mínuse. Pracovníci nič z toho nevidia.</span></div></label></div>
    <div class="field"><label for="sTpp">Hodina TPP stojí firmu (× sadzba)</label><input id="sTpp" type="number" min="1" max="3" step="0.01" value="${C.tpp_coef}"><span class="hint">Odvody zamestnávateľa, bežne okolo 1,36. Živnostník = len sadzba.</span></div>
    <div class="field"><label for="sMargin">Upozorniť pri zisku pod (%)</label><input id="sMargin" type="number" min="0" max="100" value="${C.margin_warn_pct}"><span class="hint">Zákazka sa označí oranžovou, v strate červenou</span></div>`;
}
function costSettingsRow(f) {
  return f.sCosts ? {costs_enabled: f.sCosts.checked, tpp_coef: Math.min(3, Math.max(1, r2(f.sTpp.value) || 1)), margin_warn_pct: f.sMargin.value === "" ? 10 : +f.sMargin.value} : {};
}
// po zapnutí modulu: kategórie podľa zamerania firmy (len ak ešte žiadne nie sú)
async function afterCostSettings() {
  if (!costsOn()) { CC = []; PF = {}; return; }
  const n = await q(sb.from("cost_categories").select("id").eq("company_id", C.id).limit(1));
  if (!n.length) await q(sb.from("cost_categories").insert((COST_CATS[C.focus] || COST_CATS.vseob).map((name, i) => ({company_id: C.id, name, sort: (i + 1) * 10}))));
  await loadCosts();
}
function catCardHtml() {
  if (!costsOn()) return "";
  return `<div class="card" style="display:flex;flex-direction:column;gap:10px"><h3>Kategórie nákladov</h3>
    <p class="muted" style="margin:0">Do týchto kategórií sa delia doklady pri zákazke. Skrytá kategória sa pri novom doklade neponúka, staré doklady ju ponechajú.</p>
    <form class="bar" data-form="ccat"><input id="ccName" placeholder="Nová kategória, napr. Zinkovanie" required style="flex:1;min-width:200px" aria-label="Názov kategórie"><button class="btn accent">+ Pridať</button></form>
    <div class="tablewrap"><table><thead><tr><th>Kategória</th><th>Ponúkať</th><th></th></tr></thead><tbody>
    ${CC.map(c => `<tr><td><input data-ccat-name="${c.id}" value="${esc(c.name)}" style="width:100%;min-height:34px;border:1px solid transparent;background:transparent;border-radius:8px;padding:4px 8px" aria-label="Názov kategórie"></td>
      <td><label><input type="checkbox" data-ccat-active="${c.id}" ${c.active ? "checked" : ""}> ponúkať</label></td>
      <td class="r"><button class="btn sm danger" data-act="ccat-del" data-id="${c.id}">Zmazať</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty">Žiadne kategórie.</td></tr>`}
    </tbody></table></div></div>`;
}
async function updCat(id, row) {
  try { const c = await q(sb.from("cost_categories").update(row).eq("id", id).select().single()); CC = CC.map(x => x.id === id ? c : x); toast("Uložené"); }
  catch (e) { toast(errMsg(e), true); }
}

/* ---------- Náklady / doklady (zoznam) ---------- */
async function loadDocs() {
  let items, docs;
  const itemsOf = async ids => { const out = []; for (let i = 0; i < ids.length; i += 150) out.push(...await fetchAll(() => sb.from("cost_items").select("*").in("doc_id", ids.slice(i, i + 150)).order("id"))); return out; };
  const docsIn = async ids => { const out = []; for (let i = 0; i < ids.length; i += 150) out.push(...await fetchAll(() => sb.from("cost_docs").select("*").in("id", ids.slice(i, i + 150)).order("id"))); return out; };
  if (costFlt.project || costFlt.unassigned) {
    const base = costFlt.project ? sb.from("cost_items").select("doc_id").eq("project_id", costFlt.project)
      : sb.from("cost_items").select("doc_id").eq("company_id", C.id).is("project_id", null);
    const ids = [...new Set((await fetchAll(() => base.order("id"))).map(i => i.doc_id))];
    docs = await docsIn(ids);
  } else {
    const [a, b] = monthRange(costFlt.month);
    docs = await fetchAll(() => sb.from("cost_docs").select("*").eq("company_id", C.id).gte("issued_on", dateKey(a)).lt("issued_on", dateKey(b)).order("issued_on", {ascending: false}));
  }
  items = await itemsOf(docs.map(d => d.id));
  docs.sort((x, y) => (y.issued_on > x.issued_on ? 1 : y.issued_on < x.issued_on ? -1 : 0) || (ms(y.created_at) - ms(x.created_at)));
  return docs.map(d => ({...d, items: items.filter(i => i.doc_id === d.id)}));
}
async function renderCosts(main) {
  if (!costsOn()) { location.hash = "#nastavenia"; return; }
  costFlt.month = costFlt.month || curMonth();
  const [docs, un] = await Promise.all([loadDocs(), fetchAll(() => sb.from("cost_items").select("amount").eq("company_id", C.id).is("project_id", null).order("id"))]);
  const total = r2(sumBy(docs, d => sumBy(d.items, i => +i.amount)));
  const unSum = r2(sumBy(un, i => +i.amount));
  const pr = costFlt.project && project(costFlt.project);
  main.innerHTML = `<div class="head"><h1>Náklady / doklady</h1><button class="btn accent" data-act="cdoc-new">+ Nový doklad</button></div>
  <div class="stats">
    <div class="stat"><div class="l">${pr ? "Doklady zákazky" : costFlt.unassigned ? "Nepriradené" : "Spolu za mesiac"}</div><div class="v num">${eur(total)}</div><div class="small muted">bez DPH · ${docs.length} ${docs.length === 1 ? "doklad" : docs.length > 1 && docs.length < 5 ? "doklady" : "dokladov"}</div></div>
    <div class="stat"><div class="l">Nepriradené k zákazke</div><div class="v num ${un.length ? "warnc" : ""}">${eur(unSum)}</div><div class="small muted">${un.length} ${un.length === 1 ? "položka" : un.length > 1 && un.length < 5 ? "položky" : "položiek"}</div></div>
  </div>
  <div class="bar">
    <input type="month" id="fCostMonth" value="${costFlt.month}" aria-label="Mesiac" ${pr || costFlt.unassigned ? "disabled" : ""}>
    <select id="fCostProject" aria-label="Zákazka"><option value="">Všetky zákazky</option>${P.map(p => `<option value="${p.id}" ${costFlt.project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
    <button class="chip ${costFlt.unassigned ? "on" : ""}" data-act="cdocs-unassigned">Nepriradené${un.length ? ` (${un.length})` : ""}</button>
  </div>
  ${pr || costFlt.unassigned ? `<p class="muted small" style="margin:0">Zobrazené sú doklady za celé obdobie.</p>` : ""}
  <div class="tablewrap"><table><thead><tr><th>Dátum</th><th>Doklad</th><th>Rozdelenie</th><th class="r">Bez DPH</th></tr></thead><tbody>
  ${docs.length ? docs.map(d => `<tr class="click" data-act="cdoc" data-id="${d.id}">
    <td class="num">${dFull(d.issued_on)}</td>
    <td><b>${esc(d.supplier || "Bez dodávateľa")}</b><br><span class="small muted">${DOC_KIND[d.kind]}${d.doc_no ? " " + esc(d.doc_no) : ""}${d.files.length ? ` · príloha ${d.files.length}×` : ` · <span class="warnc">bez prílohy</span>`}</span></td>
    <td class="small">${d.items.map(i => `<div>${i.project_id ? esc(project(i.project_id)?.name || "?") : `<span class="warnc">nepriradené</span>`} · ${esc(catName(i.category_id))} · <b class="num">${eur(i.amount)}</b></div>`).join("")}</td>
    <td class="r num"><b>${eur(sumBy(d.items, i => +i.amount))}</b></td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">${pr ? "K tejto zákazke zatiaľ nie je žiadny doklad." : costFlt.unassigned ? "Všetko je priradené k zákazkám." : "V tomto mesiaci zatiaľ žiadny doklad."}</td></tr>`}
  </tbody></table></div>
  <p class="muted small">Sumy sú bez DPH. Jeden doklad sa dá rozdeliť na viac zákaziek a kategórií. Prácu z dochádzky sem netreba zadávať, zaráta sa pri zákazke sama.</p>`;
}

/* ---------- okno dokladu ---------- */
let docFiles = [], docKeep = [], supCat = {};
const itemRowHtml = (it = {}) => {
  const projs = P.filter(p => p.active || p.id === it.project_id), cats = CC.filter(c => c.active || c.id === it.category_id);
  return `<div class="ditem">
    <select data-k="project" aria-label="Zákazka"><option value="">— nepriradené —</option>${projs.map(p => `<option value="${p.id}" ${p.id === it.project_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
    <select data-k="category" aria-label="Kategória"><option value="">Bez kategórie</option>${cats.map(c => `<option value="${c.id}" ${c.id === it.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
    <input data-k="amount" type="number" step="0.01" inputmode="decimal" placeholder="Suma bez DPH €" value="${it.amount ?? ""}" aria-label="Suma bez DPH">
    <input data-k="note" placeholder="Poznámka" value="${esc(it.note || "")}" aria-label="Poznámka">
    <button type="button" class="btn sm" data-act="ditem-del" aria-label="Odobrať riadok">✕</button></div>`;
};
async function openDoc(id, presetProject) {
  let d = {kind: "faktura", supplier: "", doc_no: "", issued_on: dateKey(Date.now()), vat: null, files: [], note: "", items: []};
  if (id) { d = await q(sb.from("cost_docs").select("*").eq("id", id).single()); d.items = await q(sb.from("cost_items").select("*").eq("doc_id", id).order("created_at")); }
  if (!d.items.length) d.items = [{project_id: presetProject || null, category_id: null, amount: null, note: ""}];
  docFiles = []; docKeep = [...(d.files || [])];
  // dodávatelia z posledných dokladov a ich naposledy použitá kategória
  try {
    const last = await q(sb.from("cost_docs").select("id,supplier").eq("company_id", C.id).order("created_at", {ascending: false}).limit(300));
    const its = last.length ? await q(sb.from("cost_items").select("doc_id,category_id").in("doc_id", last.slice(0, 150).map(x => x.id))) : [];
    supCat = {}; last.slice().reverse().forEach(x => { const c = its.find(i => i.doc_id === x.id && i.category_id); if (x.supplier && c) supCat[x.supplier.toLowerCase()] = c.category_id; });
    d.sups = [...new Set(last.map(x => x.supplier).filter(Boolean))];
  } catch (e) { d.sups = []; }
  modal(id ? (d.supplier || "Doklad") : "Nový doklad", `<form class="form" data-form="cdoc" data-id="${id || ""}">
    <div class="field"><label for="cdKind">Druh</label><select id="cdKind">${Object.entries(DOC_KIND).map(([k, t]) => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="field"><label for="cdDate">Dátum dokladu</label><input id="cdDate" type="date" required value="${d.issued_on}"></div>
    <div class="field"><label for="cdSup">Dodávateľ</label><input id="cdSup" list="cdSups" value="${esc(d.supplier || "")}" placeholder="napr. Ferona, lakovňa…" autocomplete="off"><datalist id="cdSups">${d.sups.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
    <div class="field"><label for="cdNo">Číslo dokladu</label><input id="cdNo" value="${esc(d.doc_no || "")}"></div>
    <div class="full"><div class="lbl" style="margin-bottom:6px">Na čo a koľko (bez DPH)</div>
      <div id="cdItems" class="ditems">${d.items.map(itemRowHtml).join("")}</div>
      <div class="bar" style="margin-top:8px"><button type="button" class="btn sm" data-act="ditem-add">+ Rozdeliť na ďalšiu zákazku / kategóriu</button><span class="grow" style="flex:1"></span><span>Spolu bez DPH <b class="num" id="cdTotal">${eur(sumBy(d.items, i => +i.amount || 0))}</b></span></div></div>
    <div class="field"><label for="cdVat">DPH z dokladu €</label><input id="cdVat" type="number" min="0" step="0.01" value="${d.vat ?? ""}"><span class="hint">Nepovinné, len pre prehľad. Do nákladov sa neráta.</span></div>
    <div class="field"><label for="cdNote">Poznámka</label><input id="cdNote" value="${esc(d.note || "")}"></div>
    <div class="field full"><label for="cdFile">Príloha (fotka alebo PDF)</label><input id="cdFile" type="file" accept="image/*,application/pdf" multiple>
      <div id="cdFiles" class="bar"></div></div>
  </form>`, `${id ? `<button class="btn danger" data-act="cdoc-del" data-id="${id}">Zmazať</button>` : ""}<span class="grow"></span><button class="btn" data-act="close">Zrušiť</button><button class="btn primary" data-act="cdoc-save">Uložiť</button>`, true);
  renderDocFiles();
}
function renderDocFiles() {
  const el = $("#cdFiles"); if (!el) return;
  el.innerHTML = docKeep.map((p, i) => `<span class="chip"><a href="#" data-act="cdoc-file" data-path="${esc(p)}">${p.toLowerCase().endsWith(".pdf") ? "PDF" : "Fotka"} ${i + 1}</a><button type="button" class="btn sm" data-act="cdoc-file-del" data-i="${i}" aria-label="Odobrať prílohu">✕</button></span>`).join("")
    + docFiles.map((f, i) => `<span class="chip">${esc(f.name)} <span class="muted">nová</span><button type="button" class="btn sm" data-act="cdoc-newfile-del" data-i="${i}" aria-label="Odobrať">✕</button></span>`).join("");
}
function docTotal() {
  const t = [...document.querySelectorAll("#cdItems [data-k=amount]")].reduce((a, i) => a + (r2(i.value) || 0), 0);
  const el = $("#cdTotal"); if (el) el.textContent = eur(t);
}
// fotka dokladu sa zmenší (stačí na čítanie), PDF ide tak, ako je
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.size < 1.5e6) return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 2200 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(ok => c.toBlob(ok, "image/jpeg", .85));
    return b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", {type: "image/jpeg"}) : file;
  } catch (e) { return file; }
}
async function saveDoc() {
  const f = $("[data-form=cdoc]"); const id = f.dataset.id;
  const items = [...document.querySelectorAll("#cdItems .ditem")].map(r => ({project_id: r.querySelector("[data-k=project]").value || null, category_id: r.querySelector("[data-k=category]").value || null,
    amount: r.querySelector("[data-k=amount]").value === "" ? null : r2(r.querySelector("[data-k=amount]").value), note: r.querySelector("[data-k=note]").value.trim() || null}))
    .filter(i => i.amount != null || i.project_id || i.category_id || i.note);
  if (!items.length || items.some(i => i.amount == null || i.amount === 0)) return toast("Pri každom riadku zadaj sumu bez DPH", true);
  if (!f.cdDate.value) return toast("Zadaj dátum dokladu", true);
  const btn = $("[data-act=cdoc-save]"); if (btn) btn.disabled = true;
  try {
    const row = {kind: f.cdKind.value, supplier: f.cdSup.value.trim() || null, doc_no: f.cdNo.value.trim() || null, issued_on: f.cdDate.value,
      vat: f.cdVat.value === "" ? null : r2(f.cdVat.value), note: f.cdNote.value.trim() || null};
    const doc = id ? await q(sb.from("cost_docs").update(row).eq("id", id).select().single())
                   : await q(sb.from("cost_docs").insert({...row, company_id: C.id}).select().single());
    // prílohy: nové nahrať, odobraté zmazať
    const added = [];
    for (const file0 of docFiles) {
      const file = await shrinkImage(file0);
      if (file.size > 10e6) { toast(file.name + ": súbor je väčší ako 10 MB", true); continue; }
      const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
      const path = `${C.id}/${doc.id}/${crypto.randomUUID()}.${ext}`;
      await q(sb.storage.from("doklady").upload(path, file, {contentType: file.type || "application/octet-stream"}));
      added.push(path);
    }
    const removed = (doc.files || []).filter(p => !docKeep.includes(p));
    if (removed.length) await q(sb.storage.from("doklady").remove(removed));
    if (added.length || removed.length) await q(sb.from("cost_docs").update({files: docKeep.concat(added)}).eq("id", doc.id));
    // rozdelenie: staré riadky nahradia nové
    if (id) await q(sb.from("cost_items").delete().eq("doc_id", id));
    await q(sb.from("cost_items").insert(items.map(i => ({...i, company_id: C.id, doc_id: doc.id}))));
    closeModal(); toast("Doklad uložený"); go();
  } catch (e) { toast(errMsg(e), true); if (btn) btn.disabled = false; }
}
async function deleteDoc(id) {
  if (!confirm("Zmazať doklad aj s prílohami? Náklad zmizne zo zákaziek.")) return;
  const d = await q(sb.from("cost_docs").select("files").eq("id", id).single());
  if ((d.files || []).length) await q(sb.storage.from("doklady").remove(d.files));
  await q(sb.from("cost_items").delete().eq("doc_id", id));
  await q(sb.from("cost_docs").delete().eq("id", id));
  closeModal(); toast("Doklad zmazaný"); go();
}

/* =====================================================================
   DVOJSTUPŇOVÉ OVERENIE (kód z aplikácie v mobile, napr. Google Authenticator)
   ===================================================================== */
async function mfaLevel() {
  try { const {data} = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return {cur: data?.currentLevel || "aal1", next: data?.nextLevel || "aal1"}; }
  catch (e) { return {cur: "aal1", next: "aal1"}; }
}
async function mfaFactors() {
  try { const {data} = await sb.auth.mfa.listFactors(); return {all: data?.all || [], ok: (data?.totp || []).filter(f => f.status === "verified")}; }
  catch (e) { return {all: [], ok: []}; }
}
// prihlásenie: po hesle ešte kód
function renderMfaLogin(msg) {
  $("#shell").hidden = true; $("#auth").hidden = false;
  $("#auth").innerHTML = `<form class="card" data-form="mfa">
    <div><h1>Overovací kód</h1><p class="muted" style="margin:4px 0 0">Otvor v mobile aplikáciu na overovanie (napr. Google Authenticator) a opíš 6-miestny kód pre Dochádzku.</p></div>
    ${msg ? `<p class="flag" style="margin:0">${esc(msg)}</p>` : ""}
    <div class="field"><label for="mfaCode">Kód</label><input id="mfaCode" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" style="font-size:24px;letter-spacing:.2em;text-align:center"></div>
    <button class="btn primary" style="min-height:46px">Overiť</button>
    <button class="btn" type="button" data-act="logout">Odhlásiť</button>
    <p class="muted small" style="margin:0">Stratil si mobil? Iný správca firmy ti overenie môže vypnúť, alebo napíš správcovi systému.</p></form>`;
  $("#mfaCode").focus();
}
async function mfaVerifyLogin(f) {
  const {ok} = await mfaFactors();
  if (!ok.length) return start();
  const {error} = await sb.auth.mfa.challengeAndVerify({factorId: ok[0].id, code: f.mfaCode.value.replace(/\s/g, "")});
  if (error) return renderMfaLogin(/invalid|expired/i.test(error.message) ? "Nesprávny alebo starý kód. Skús ďalší." : errMsg(error));
  await start();
}
// zapnutie: QR kód do aplikácie → prvý kód
async function mfaEnrollHtml() {
  const {all} = await mfaFactors();
  for (const f of all.filter(f => f.status !== "verified")) { try { await sb.auth.mfa.unenroll({factorId: f.id}); } catch (e) {} }
  const {data, error} = await sb.auth.mfa.enroll({factorType: "totp", friendlyName: "Dochádzka " + new Date().toLocaleString("sk-SK")});
  if (error) throw error;
  return `<div class="mfaenroll" style="display:flex;flex-direction:column;gap:10px">
    <ol style="margin:0;padding-left:20px"><li>V mobile si nainštaluj aplikáciu na overovanie (Google Authenticator, Microsoft Authenticator…).</li><li>V nej pridaj účet naskenovaním QR kódu.</li><li>Opíš 6-miestny kód, ktorý aplikácia ukáže.</li></ol>
    <img src="${esc(data.totp.qr_code)}" alt="QR kód pre aplikáciu na overovanie" style="width:200px;height:200px;background:#fff;border-radius:10px;padding:8px;align-self:center">
    <div class="small muted" style="text-align:center">Nedá sa skenovať? Zadaj kľúč ručne: <code style="user-select:all;word-break:break-all">${esc(data.totp.secret)}</code></div>
    <div class="bar"><input id="mfaNewCode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="6-miestny kód" style="flex:1;font-size:20px;letter-spacing:.15em" aria-label="Kód z aplikácie">
      <button class="btn primary" type="button" data-act="mfa-verify" data-id="${data.id}">Potvrdiť a zapnúť</button></div></div>`;
}
// firma vyžaduje overenie a správca ho ešte nemá → musí si ho nastaviť
async function renderMfaForced() {
  $("#shell").hidden = true; $("#auth").hidden = false;
  $("#auth").innerHTML = `<div class="card"><div><h1>Zapni si dvojstupňové overenie</h1><p class="muted" style="margin:4px 0 0">Firma ${esc(C.name)} ho vyžaduje od všetkých správcov. Pri prihlásení potom zadáš aj kód z mobilu.</p></div>
    <div id="mfaBox"><div class="empty">Pripravujem…</div></div><button class="btn" type="button" data-act="logout">Odhlásiť</button></div>`;
  try { $("#mfaBox").innerHTML = await mfaEnrollHtml(); } catch (e) { $("#mfaBox").innerHTML = `<p class="flag">${esc(errMsg(e))}</p>`; }
}
async function mfaCardHtml() {
  if (!costsSql()) return "";
  const {ok} = await mfaFactors(), lvl = await mfaLevel();
  return `<div class="card" style="display:flex;flex-direction:column;gap:10px" id="mfaCard"><h3>Dvojstupňové overenie (môj účet)</h3>
    <p class="muted" style="margin:0">Pri prihlásení do administrácie sa okrem hesla zadá aj kód z aplikácie v mobile. Ceny, náklady a doklady potom databáza nevydá bez kódu, takže samotné heslo nestačí.</p>
    ${ok.length ? `<div class="bar"><span class="tag go">zapnuté</span><span class="small muted" style="flex:1">${ok.length === 1 ? "1 zariadenie" : ok.length + " zariadenia"}</span>
        <button class="btn sm" data-act="mfa-add">Pridať ďalšie zariadenie</button>${ok.map(f => `<button class="btn sm danger" data-act="mfa-off" data-id="${f.id}">Vypnúť${ok.length > 1 ? " " + esc(f.friendly_name || "") : ""}</button>`).join("")}</div>`
      : `<div class="bar"><span class="tag">vypnuté</span><span style="flex:1"></span><button class="btn accent" data-act="mfa-add">Zapnúť</button></div>`}
    <div id="mfaBox"></div>
    <label class="check"><input type="checkbox" id="sMfaReq" ${C.mfa_required ? "checked" : ""} ${lvl.cur === "aal2" ? "" : "disabled"}><div><b>Vyžadovať od všetkých správcov firmy</b><span>${lvl.cur === "aal2" ? "Kto ho ešte nemá, pri ďalšom prihlásení si ho bude musieť nastaviť." : "Najprv si ho zapni sám a prihlás sa s kódom."}</span></div></label>
  </div>`;
}

/* ---------- udalosti modulu ---------- */
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  try {
    switch (a) {
      case "cdoc": await openDoc(id); break;
      case "cdoc-new": if (!costsOn()) return; await openDoc(null, id || costFlt.project || null); break;
      case "cdoc-save": await saveDoc(); break;
      case "cdoc-del": await deleteDoc(id); break;
      case "cdocs-project": costFlt = {...costFlt, project: id, unassigned: false}; navTo("#naklady"); break;
      case "cdocs-unassigned": costFlt = {...costFlt, unassigned: !costFlt.unassigned, project: ""}; go(); break;
      case "ditem-add": { const box = $("#cdItems"), last = box.querySelector(".ditem:last-child");
        box.insertAdjacentHTML("beforeend", itemRowHtml({category_id: last?.querySelector("[data-k=category]").value || null}));
        box.querySelector(".ditem:last-child [data-k=project]").focus(); break; }
      case "ditem-del": { const rows = document.querySelectorAll("#cdItems .ditem");
        if (rows.length > 1) el.closest(".ditem").remove(); else el.closest(".ditem").querySelectorAll("input").forEach(i => i.value = "");
        docTotal(); break; }
      case "cdoc-file": { const u = await q(sb.storage.from("doklady").createSignedUrl(el.dataset.path, 3600)); window.open(u.signedUrl, "_blank", "noopener"); break; }
      case "cdoc-file-del": docKeep.splice(+el.dataset.i, 1); renderDocFiles(); break;
      case "cdoc-newfile-del": docFiles.splice(+el.dataset.i, 1); renderDocFiles(); break;
      case "ccat-del": { const n = (await q(sb.from("cost_items").select("id").eq("category_id", id).limit(1))).length;
        if (!confirm(n ? "Kategória je použitá na dokladoch. Po zmazaní budú tieto položky „Bez kategórie“. Radšej ju môžeš len prestať ponúkať. Zmazať?" : "Zmazať kategóriu?")) return;
        await q(sb.from("cost_categories").delete().eq("id", id)); CC = CC.filter(c => c.id !== id); go(); break; }
      case "mfa-add": { const box = $("#mfaBox"); box.innerHTML = `<div class="empty">Pripravujem…</div>`; box.innerHTML = await mfaEnrollHtml(); $("#mfaNewCode").focus(); break; }
      case "mfa-verify": { const code = ($("#mfaNewCode").value || "").replace(/\s/g, "");
        if (!/^\d{6}$/.test(code)) return toast("Zadaj 6-miestny kód z aplikácie", true);
        const {error} = await sb.auth.mfa.challengeAndVerify({factorId: id, code});
        if (error) return toast(/invalid|expired/i.test(error.message) ? "Nesprávny kód. Skús ďalší, ktorý aplikácia ukáže." : errMsg(error), true);
        toast("Dvojstupňové overenie je zapnuté"); await start(); break; }
      case "mfa-off": { const {ok} = await mfaFactors();
        if (C.mfa_required && ok.length <= 1) return toast("Firma vyžaduje overenie od všetkých správcov. Najprv vypni túto požiadavku.", true);
        if (!confirm("Vypnúť dvojstupňové overenie pre toto zariadenie?")) return;
        const {error} = await sb.auth.mfa.unenroll({factorId: id}); if (error) throw error;
        try { await sb.auth.refreshSession(); } catch (e) {}
        toast("Vypnuté"); go(); break; }
    }
  } catch (e) { toast(errMsg(e), true); console.error(e); }
});
document.addEventListener("change", async ev => {
  const t = ev.target;
  try {
    if (t.id === "cdFile") { docFiles.push(...t.files); t.value = ""; renderDocFiles(); }
    else if (t.id === "cdSup") { const c = supCat[t.value.trim().toLowerCase()], first = $("#cdItems [data-k=category]");
      if (c && first && !first.value && CC.some(x => x.id === c)) first.value = c; }
    else if (t.id === "fCostMonth") { costFlt.month = t.value || curMonth(); go(); }
    else if (t.id === "fCostProject") { costFlt.project = t.value; costFlt.unassigned = false; go(); }
    else if (t.dataset.ccatName) updCat(t.dataset.ccatName, {name: t.value.trim() || "Bez názvu"});
    else if (t.dataset.ccatActive) updCat(t.dataset.ccatActive, {active: t.checked});
    else if (t.id === "sMfaReq") { C = await q(sb.from("companies").update({mfa_required: t.checked}).eq("id", C.id).select().single()); toast(t.checked ? "Vyžaduje sa od všetkých správcov" : "Už sa nevyžaduje"); }
  } catch (e) { toast(errMsg(e), true); if (t.id === "sMfaReq") t.checked = !t.checked; }
});
document.addEventListener("input", ev => { if (ev.target.closest && ev.target.closest("#cdItems") && ev.target.dataset.k === "amount") docTotal(); });
document.addEventListener("submit", async ev => {
  const f = ev.target, k = f.dataset.form; if (k !== "ccat" && k !== "mfa") return;
  ev.preventDefault();
  try {
    if (k === "mfa") await mfaVerifyLogin(f);
    else { const c = await q(sb.from("cost_categories").insert({company_id: C.id, name: f.ccName.value.trim(), sort: (Math.max(0, ...CC.map(c => c.sort)) + 10)}).select().single());
      CC = CC.concat(c); go(); }
  } catch (e) { toast(errMsg(e), true); }
});
