// Náhrada supabase-js na testovanie v prehliadači bez servera.
// Dáta drží v localStorage ("mockdb"), takže admin aj appka pracovníka vidia to isté.
// Bez RLS – bezpečnosť sa testuje osobitne v SQL (test/rls-test.sql).
(function () {
  const load = () => JSON.parse(localStorage.getItem("mockdb") || "null") || {users: [], companies: [], company_admins: [], workers: [], projects: [], tasks: [], rates: [], entries: [], absences: [], files: {}};
  const store = db => localStorage.setItem("mockdb", JSON.stringify(db));
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const code = () => Array.from({length: 8}, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
  const AUTHKEY = "mockauth:" + (location.pathname.includes("/admin/") ? "admin" : "app");
  const session = () => JSON.parse(localStorage.getItem(AUTHKEY) || "null");
  const DEFAULTS = {
    companies: () => ({id: uuid(), gps_enabled: false, breaks_enabled: false, default_radius: 500, default_rate: 0, forgot_checkout_hour: 18, max_shift_hours: 12, budget_warn_pct: 80, created_at: now()}),
    workers: () => ({id: uuid(), type: "TPP", hourly_rate: null, active: true, user_id: null, invite_code: code(), gps_consent: null, phone: null, note: null, created_at: now()}),
    projects: () => ({id: uuid(), address: null, lat: null, lng: null, radius: null, budget: null, active: true, note: null, created_at: now()}),
    tasks: () => ({active: true}),
    rates: () => ({id: uuid(), worker_id: null, project_id: null, task_num: null, created_at: now()}),
    entries: () => ({other_text: "", task_num: 0, note: "", photos: [], end_at: null, start_orig: null, end_orig: null, edited: false, gps_start: null, gps_end: null, breaks: [], by_admin: false, created_at: now(), updated_at: now()}),
    absences: () => ({id: uuid(), note: null, created_at: now()})
  };
  const KEYS = {tasks: ["company_id", "num"]};
  const keyOf = (t, r) => (KEYS[t] || ["id"]).map(k => r[k]).join("|");
  const ok = data => Promise.resolve({data, error: null});
  const fail = message => Promise.resolve({data: null, error: {message}});

  class QB {
    constructor(t) { this.t = t; this.f = []; this.op = "select"; this.ret = false; this.one = 0; this.ord = []; this.rng = null; }
    select() { if (this.op !== "select") this.ret = true; return this; }
    eq(k, v) { this.f.push(r => r[k] === v); return this; }
    neq(k, v) { this.f.push(r => r[k] !== v); return this; }
    in(k, a) { this.f.push(r => a.includes(r[k])); return this; }
    is(k, v) { this.f.push(r => r[k] === v || (v === null && r[k] == null)); return this; }
    gte(k, v) { this.f.push(r => r[k] >= v); return this; }
    gt(k, v) { this.f.push(r => r[k] > v); return this; }
    lt(k, v) { this.f.push(r => r[k] < v); return this; }
    lte(k, v) { this.f.push(r => r[k] <= v); return this; }
    order(k, o) { this.ord.push([k, !(o && o.ascending === false)]); return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    limit(n) { this.rng = [0, n - 1]; return this; }
    single() { this.one = 1; return this; }
    maybeSingle() { this.one = 2; return this; }
    insert(d) { this.op = "insert"; this.d = d; return this; }
    upsert(d) { this.op = "upsert"; this.d = d; return this; }
    update(d) { this.op = "update"; this.d = d; return this; }
    delete() { this.op = "delete"; return this; }
    then(res, rej) { return this.exec().then(res, rej); }
    async exec() {
      const db = load(); const tb = db[this.t]; let out;
      const match = r => this.f.every(f => f(r));
      if (this.op === "select") {
        out = tb.filter(match);
        for (const [k, asc] of this.ord.slice().reverse()) out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      } else if (this.op === "insert" || this.op === "upsert") {
        const arr = Array.isArray(this.d) ? this.d : [this.d]; out = [];
        for (const d of arr) {
          const i = tb.findIndex(r => keyOf(this.t, r) === keyOf(this.t, {...DEFAULTS[this.t](), ...d}));
          const row = {...(DEFAULTS[this.t] ? DEFAULTS[this.t]() : {}), ...d};
          if (i >= 0) { if (this.op === "insert") return fail("duplicate key value violates unique constraint \"" + this.t + "_pkey\""); tb[i] = {...tb[i], ...d, updated_at: now()}; out.push(tb[i]); }
          else { tb.push(row); out.push(row); }
        }
      } else if (this.op === "update") {
        out = tb.filter(match); out.forEach(r => Object.assign(r, this.d));
      } else if (this.op === "delete") {
        out = tb.filter(match); db[this.t] = tb.filter(r => !match(r));
      }
      if (this.op !== "select") store(db);
      out = JSON.parse(JSON.stringify(out));
      if (this.one) { if (out.length !== 1 && this.one === 1) return fail("JSON object requested, multiple (or no) rows returned"); return ok(out[0] || null); }
      return ok(this.op === "select" || this.ret ? out : null);
    }
  }

  const listeners = [];
  const setSession = u => { localStorage.setItem(AUTHKEY, JSON.stringify(u ? {user: u, access_token: "x"} : null)); listeners.forEach(f => f(u ? "SIGNED_IN" : "SIGNED_OUT", session())); };
  const auth = {
    async getSession() { return {data: {session: session()}, error: null}; },
    onAuthStateChange(f) { listeners.push(f); return {data: {subscription: {unsubscribe() {}}}}; },
    async signInWithPassword({email, password}) {
      const db = load(); const u = db.users.find(x => x.email === email);
      if (!u || u.password !== password) return {data: {}, error: {message: "Invalid login credentials"}};
      setSession({id: u.id, email}); return {data: {user: {id: u.id, email}, session: session()}, error: null};
    },
    async signUp({email, password}) {
      const db = load(); if (db.users.some(x => x.email === email)) return {data: {}, error: {message: "User already registered"}};
      const u = {id: uuid(), email, password}; db.users.push(u); store(db);
      setSession({id: u.id, email}); return {data: {user: {id: u.id, email}, session: session()}, error: null};
    },
    async signInAnonymously() { const u = {id: uuid(), is_anonymous: true}; setSession(u); return {data: {user: u, session: session()}, error: null}; },
    async signOut() { setSession(null); return {error: null}; },
    async resetPasswordForEmail() { return {data: {}, error: null}; }
  };
  const uid = () => session()?.user?.id;
  const RPC = {
    my_admin_company() { return load().company_admins.find(a => a.user_id === uid())?.company_id || null; },
    create_company({p_name}) {
      const db = load(); const c = {...DEFAULTS.companies(), name: p_name}; db.companies.push(c);
      db.company_admins.push({user_id: uid(), company_id: c.id});
      [[0, "Nezaradené"], [5, "Búranie"], [7, "Maľovanie"], [8, "Montáž SDK"], [9, "Murovanie"]].forEach(([num, name]) => db.tasks.push({company_id: c.id, num, name, active: true}));
      store(db); return c.id;
    },
    claim_invite({p_code}) {
      const c = p_code.toUpperCase().replace(/[^A-Z0-9]/g, ""); const db = load();
      const w = db.workers.find(x => x.invite_code === c && x.active); if (!w) throw new Error("Neplatný kód");
      db.workers.forEach(x => { if (x.user_id === uid()) x.user_id = null; }); w.user_id = uid(); store(db); return w.id;
    },
    new_invite_code({p_worker}) { const db = load(); const w = db.workers.find(x => x.id === p_worker); w.invite_code = code(); w.user_id = null; store(db); return w.invite_code; },
    set_gps_consent({p_consent}) { const db = load(); db.workers.forEach(w => { if (w.user_id === uid()) w.gps_consent = p_consent; }); store(db); return null; }
  };
  const PIXEL = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#c96"/></svg>');
  window.supabase = {
    createClient() {
      return {
        from: t => new QB(t),
        rpc: async (n, a) => { try { return {data: RPC[n](a || {}), error: null}; } catch (e) { return {data: null, error: {message: e.message}}; } },
        auth,
        storage: {from: () => ({
          async upload(path, blob) { const db = load(); db.files[path] = blob.size; store(db); return {data: {path}, error: null}; },
          async createSignedUrls(paths) { return {data: paths.map(p => ({path: p, signedUrl: PIXEL})), error: null}; }
        })}
      };
    }
  };
})();
