(ns real-squint-probe
  (:require ["../../dist/effects/dispatch.js" :as d]
            ["../../dist/interop/paths.js" :as p]
            ["../../dist/examples/todo/todo.js" :as todo]))

;; Re-run of the R1 probe (experiments/real-squint-probe.cljs, y9d.3) at the
;; pinned squint version — squint data against the REAL built tambor
;; (dist/, emitted by tsconfig.build.json). Path adjusted for
;; experiments/cljs-reruns/.

(def state (todo/todoState))
(def $todos todo/TODOS_PATH)

;; squint map as state: same data, compiled to plain JS — real example fns
;; must accept it unchanged
(def squint-state {:todos [{:description "first" :complete? false}
                           {:description "second" :complete? false}
                           {:description "third" :complete? true}]
                   :next-todo-text "" :selected-filter "all"})
(def rows-from-squint (todo/todoRows squint-state $todos))
(js/console.log "todoRows over squint-state OK, rows:" (count rows-from-squint))

;; real path derivation: filtered view
(def active? (fn [t] (not (:complete? t))))
(def $visible (p/concatPath $todos [(p/filterNav active?)]))
(def $vis-nth (fn [i] (p/concatPath $todos [(p/filterNav active?) (p/nthNav i)])))
(def visible (filter active? (:todos state)))
(js/console.log "visible:" (pr-str (mapv :description visible)))

;; delete visible index 1 ("second") through the REAL dispatch tier
(def app (d/makeApp #js {:state state}))
(app/dispatch [[:delete ($vis-nth 1)]])
(def after1 (app.getState))

;; toggle visible index 0 through the filter path
(app/dispatch [[:update ($vis-nth 0) (fn [t] (update t :complete? not))]])
(def after2 (app.getState))
(js/console.log "after toggle:" (pr-str (mapv #(boolean (:complete? %)) (aget after2 "todos"))))

(def ok (and (= (count rows-from-squint) 3)
             (= (mapv :description visible) ["first" "second"])
             (= (mapv :description (aget after1 "todos")) ["first" "third"])
             (true? (boolean (:complete? (aget after2 "todos" 0))))))
(js/console.log "REAL-SQUINT-PROBE:" (if ok "PASS" "FAIL"))
(when-not ok (js/process.exit 1))
