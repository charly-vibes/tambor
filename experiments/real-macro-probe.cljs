(ns real-macro-probe
  (:require-macros [real-macro-defs :refer [defui]])
  (:require ["../dist/interop/paths.js" :as p]
            ["../dist/examples/todo/todo.js" :as todo]))

;; Probe: the untested macro path (EVALUATION tier 3) against the REAL
;; library. The defui macro desugars a component to the explicit tier-2
;; API: each(xs, $xs, fn) with concatPath/filterNav — real path derivation
;; inside macro-expansion-generated code, compiled by squint.

(def active? (fn [t] (not (:complete? t))))

(def state {:todos [{:description "first" :complete? false}
                    {:description "second" :complete? false}
                    {:description "third" :complete? true}]
            :selected-filter "active"})

(defui todo-view [{:keys [todos todos-path]}]
  (let [$todos todos-path
        $visible (p/concatPath $todos [(p/filterNav active?)])]
    (p/each (filter active? todos) $visible
            (fn [t $t] {:text (:description t) :toggle-path (p/concatPath $t [[:keypath "complete?"]])}))))

(def rows (todo-view {:todos (:todos state) :todos-path [[:keypath "todos"]]}))
(js/console.log "macro-expanded component derived:" (count rows) "visible rows")
(js/console.log "row texts:" (pr-str (mapv :text rows)))
(js/console.log "second toggle path:" (pr-str (:toggle-path (nth rows 1))))

(def ok (and (= (count rows) 2)
             (= (mapv :text rows) ["first" "second"])
             (= (nth (:toggle-path (nth rows 1)) 2) ["nth" 1])))
(js/console.log "REAL-MACRO-PROBE:" (if ok "PASS" "FAIL"))
(when-not ok (js/process.exit 1))
