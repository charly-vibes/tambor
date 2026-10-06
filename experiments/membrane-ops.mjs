// Stand-in for membrane-ts core with an injectable DataOps seam (default = plain JS).
export const jsOps = {
  get: (c, k) => (c == null ? undefined : c[k]),
  assoc: (c, k, v) => { const x = Array.isArray(c) ? c.slice() : { ...c }; x[k] = v; return x; },
  toArray: (x) => (x == null ? [] : Array.isArray(x) ? x : Array.from(x)),
  tag: (x) => x,
};
export const select = (st, path, ops = jsOps) => ops.toArray(path).reduce((s, k) => (s == null ? undefined : ops.get(s, k)), st);
export const set = (st, path, v, ops = jsOps) => {
  const p = ops.toArray(path);
  const go = (s, i) => (i === p.length ? v : ops.assoc(s, p[i], go(ops.get(s, p[i]), i + 1)));
  return go(st, 0);
};
const builtins = {
  update: (st, [, path, f, ...a], ops) => set(st, path, f(select(st, path, ops), ...a), ops),
  set: (st, [, path, v], ops) => set(st, path, v, ops),
};
export const dispatch = (st, batch, ops = jsOps) =>
  ops.toArray(batch).reduce((s, e) => {
    const eff = ops.toArray(e); const h = builtins[ops.tag(eff[0])];
    return h ? h(s, eff, ops) : (console.warn("unknown effect", ops.tag(eff[0])), s);
  }, st);
