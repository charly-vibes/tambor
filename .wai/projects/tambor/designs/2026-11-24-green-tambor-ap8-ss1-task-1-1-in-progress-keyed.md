---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-execute-add-keyed-dom-reconciliation, pipeline-step:green]
---

GREEN tambor-ap8 §1 (task 1.1, in progress): keyed(key,drawable)+KeyedDraw/isKeyed/keyedInner/declaredKey in src/views/nodes.ts (frozen plain data, loud TypeError on non-primitive/empty/non-finite keys and group drawables; drawables tuple keeps canvas unknown-fallback parity); reconcile(prev,next,key)+ReconcileStep/KeyFn in src/render/dom-reuse.ts (pure plan: key locates+Object.is+inner-Elem-identity confirms; duplicate keys FIRST-MATCH-WINS — further same-key children BUILD, never splice, per Pins; positional fallback = M1 rule; per-plan donation sets guard double-claims). dom-painters.ts re-exports reconcile via its EXISTING lines (file at 400-line cap, zero new lines). Pending: model.ts hub re-export, header wording, narrow run just test.
