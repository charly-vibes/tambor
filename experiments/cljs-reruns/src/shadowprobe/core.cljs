(ns shadowprobe.core
  (:require ["interop/paths.js" :as p]
            ["effects/paths.js" :as ep]))

;; Re-run of the R4 probe (experiments/shadow-probe, y9d.3) at the pinned
;; shadow-cljs version — the :advanced risk from EVALUATION.md's
;; compatibility matrix: munged property access breaking plain-data APIs.
;; Keyword paths and navigator construction must survive (data is plain JS
;; at the boundary; only our own code gets munged). Extended here to also
;; re-check the recorded clj->js caveat.

(defn main [& _]
  (let [todos #js [#js {:description "first" "complete?" false}
                   #js {:description "second" "complete?" false}
                   #js {:description "third" "complete?" true}]
        state #js {:todos todos}
        ;; REAL FINDING: under :advanced, CLJS persistent-vector steps fail the
        ;; real normalize (JS indexing) — materialize paths at the boundary
        $todos #js [#js ["keypath" "todos"]]
        $first (p/concatPath $todos #js [#js ["nth" 0]])]
    (let [first-item (ep/select state $first)]
      (println "item:" first-item "| aget desc:" (aget first-item "description") "| kw desc:" (:description first-item)))
    (let [v (p/concatPath $todos #js [#js ["filter" (fn [t] (not (aget t "complete?")))]])]
      (println "visible count:" (.-length (ep/select state v))))
    ;; recorded caveat: clj->js under :advanced munges to a no-op vector
    ;; pass-through — materialize data with #js literals, not clj->js
    (println "clj->js of a vector:" (pr-str (clj->js [{:a 1} {:a 2}])))
    (let [via-cljjs (ep/select (clj->js state) $first)]
      (println "select over clj->js state:" (pr-str via-cljjs)))))

(defn -main [& args] (apply main args))
