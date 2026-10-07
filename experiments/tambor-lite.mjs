// Stand-in for the compiled tambor runtime: plain functions, string tags, array paths.
export const select = (state, path) => path.reduce((s, k) => (s == null ? undefined : s[k]), state);
export const set = (state, path, v) => {
  if (path.length === 0) return v;
  const [k, ...rest] = path;
  const copy = Array.isArray(state) ? state.slice() : { ...state };
  copy[k] = set(state?.[k], rest, v);
  return copy;
};
export const update = (state, path, f, ...args) => set(state, path, f(select(state, path), ...args));
export const effects = {
  update: (st, [, path, f, ...a]) => update(st, path, f, ...a),
  set: (st, [, path, v]) => set(st, path, v),
};
export const dispatch = (state, batch) =>
  batch.reduce((st, e) => (effects[e[0]] ? effects[e[0]](st, e) : (console.warn('unknown effect', e[0]), st)), state);
export const label = (text) => ({ type: 'label', text });
export const vstack = (...kids) => ({ type: 'vstack', children: kids });
export const onMouseDown = (handler, child) => ({ type: 'on-mouse-down', handler, child });
