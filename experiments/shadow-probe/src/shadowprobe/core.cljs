(ns shadowprobe.core
  (:require ["interop/paths.js" :as p]
            ["effects/paths.js" :as ep]))

;; :advanced probe — the risk from EVALUATION.md's compatibility matrix:
;; munged property access breaking plain-data APIs. Keyword paths and
;; navigator construction must survive (data is plain JS at the boundary;
;; only our own code gets munged).

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
      (println "visible count:" (.-length (ep/select state v))))))

(defn -main [& args] (apply main args))
