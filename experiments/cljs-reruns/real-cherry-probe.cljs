(ns real-cherry-probe
  (:require ["../../dist/interop/seam.js" :as seam]))

;; Re-run of the R2 probe (experiments/real-cherry-probe.cljs, y9d.3) at the
;; pinned cherry version — cherry persistent collections against the REAL
;; built tambor seam (dist/interop/seam.js) via the DataOps ops. Path
;; adjusted for experiments/cljs-reruns/.

;; clj->js keeps fn values (unlike #js, which drops them in cherry)
(def cljs-ops
  (clj->js {:get     (fn [c k] (get c k))
            :assoc   (fn [c k v] (assoc c k v))
            ;; REAL FINDING: vector deletion is not CLJS dissoc — the ops own it
            ;; (subvec splice keeps the prefix structurally shared)
            :dissoc  (fn [c k] (if (vector? c)
                                 (into (subvec c 0 k) (subvec c (inc k)))
                                 (dissoc c k)))
            :toArray (fn [x] (to-array x))
            :tag     (fn [x]
                       (if (keyword? x)
                         (if-let [n (namespace x)] (str n "/" (name x)) (name x))
                         x))}))

;; REAL FINDING (stand-ins masked this): the seam tier materializes paths
;; with JS indexing (path[i]), so persistent-vector keyword paths must be
;; materialized at the boundary with to-array. State stays persistent; only
;; the internal path representation converts. Follow-up ticket filed for
;; first-class host-vector path support in the seam.
(def batch [[:update (to-array [:todos 2 :complete?]) not]
            [:set (to-array [:n]) 42]
            [:delete (to-array [:todos 1])]])

(def state {:todos [{:description "first" :complete? false}
                    {:description "second" :complete? false}
                    {:description "third" :complete? false}]
            :n 1})

(def r (seam/interDispatch state batch (clj->js {:ops cljs-ops})))

(js/console.log "result persistent map:" (map? r))
(js/console.log "n:" (:n r) "todo2 complete?:" (:complete? (get-in r [:todos 1])))
(js/console.log "todos after delete:" (pr-str (mapv :description (:todos r))))
(js/console.log "input untouched, todo2:" (:complete? (get-in state [:todos 2])))
(js/console.log "untouched todo shared:" (identical? (get-in state [:todos 0]) (get-in r [:todos 0])))

;; timing: 1000 dispatches on a 5000-item persistent state
(def big {:todos (vec (for [i (range 5000)] {:description (str "t" i) :complete? false})) :n 1})
(let [t0 (js/performance.now)
      _ (dotimes [_ 1000] (seam/interDispatch big [[:update (to-array [:todos 7 :complete?]) not]] (clj->js {:ops cljs-ops})))
      t1 (js/performance.now)]
  (js/console.log "1000 dispatches on 5000 items:" (.toFixed (- t1 t0) 2) "ms total,"
                  (.toFixed (/ (- t1 t0) 1000) 4) "ms/dispatch"))

(def ok (and (map? r)
             (= 42 (:n r))
             (true? (:complete? (get-in r [:todos 1])))
             (= ["first" "third"] (mapv :description (:todos r)))
             (false? (:complete? (get-in state [:todos 2])))
             (identical? (get-in state [:todos 0]) (get-in r [:todos 0]))))
(js/console.log "REAL-CHERRY-PROBE:" (if ok "PASS" "FAIL"))
(when-not ok (js/process.exit 1))
