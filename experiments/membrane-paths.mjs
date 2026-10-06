// Stand-in: navigators incl. filterer, NONE-deletion, and a path-aware `each` (no macro).
export const NONE = Symbol.for("membrane/none");
export const filter = (pred) => ({ nav: "filter", pred });
const isF = (n) => n && n.nav === "filter";
export const select = (st, path, i = 0) => {
  if (i === path.length) return st;
  const n = path[i];
  if (isF(n)) return select(st.filter(n.pred), path, i + 1);
  return st == null ? undefined : select(st[n], path, i + 1);
};
const assocKey = (c, k, v) => {
  if (Array.isArray(c)) { const x = c.slice(); if (v === NONE) x.splice(k, 1); else x[k] = v; return x; }
  const x = { ...c }; if (v === NONE) delete x[k]; else x[k] = v; return x;
};
export const set = (st, path, v, i = 0) => {
  if (i === path.length) return v;
  const n = path[i];
  if (isF(n)) {
    const sub = st.filter(n.pred);
    // mark-preserving: operate on a same-length copy so NONE can be merged back by position
    const marked = sub.slice();
    const out = setMarked(marked, path, v, i + 1);
    let k = 0; const res = [];
    for (const el of st) { if (n.pred(el)) { const nv = out[k++]; if (nv !== NONE) res.push(nv); } else res.push(el); }
    return res;
  }
  return assocKey(st, n, set(st?.[n], path, v, i + 1));
};
const setMarked = (arr, path, v, i) => {           // like set, but NONE at the first array level stays as a marker
  if (i === path.length) return v;
  const n = path[i];
  const x = arr.slice();
  x[n] = i === path.length - 1 ? v : set(arr[n], path, v, i + 1);
  return x;
};
export const effects = {
  update: (st, [, p, f, ...a]) => set(st, p, f(select(st, p), ...a)),
  set: (st, [, p, v]) => set(st, p, v),
  delete: (st, [, p]) => set(st, p, NONE),
};
export const dispatch = (st, batch) => batch.reduce((s, e) => (effects[e[0]] ?? ((x) => x))(s, e), st);
// path-aware iteration: children receive (value, path) -- no macro needed
export const each = (xs, $xs, f) => Array.from(xs, (x, i) => f(x, [...$xs, i]));
