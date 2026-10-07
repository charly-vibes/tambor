(ns seam
  (:require ["./tambor-ops.mjs" :as m]))

(def cljs-ops
  #js {:get      (fn [c k] (get c k))
       :assoc    (fn [c k v] (assoc c k v))
       :toArray  (fn [x] (to-array x))
       :tag      (fn [x] (if (keyword? x)
                           (if-let [n (namespace x)] (str n "/" (name x)) (name x))
                           x))})

(def state {:todos (vec (for [i (range 5000)] {:description (str "t" i) :complete? false})) :n 1})

;; native CLJS data and keywords straight in, no conversion
(def r (m/dispatch state [[:update [:todos 2 :complete?] not]
                          [:set [:n] 42]
                          [:update [:n] inc]
                          [::unknown [:x] 1]]
                   cljs-ops))
(js/console.log "result is persistent map:" (map? r) "| n:" (:n r) "| todo2:" (pr-str (get-in r [:todos 2])))
(js/console.log "input untouched:" (:complete? (get-in state [:todos 2])))
(js/console.log "untouched todo shared:" (identical? (get-in state [:todos 3]) (get-in r [:todos 3])))

(let [t0 (js/performance.now)
      _ (dotimes [_ 1000] (m/dispatch state [[:update [:todos 7 :complete?] not]] cljs-ops))
      t1 (js/performance.now)]
  (js/console.log "1000 dispatches on 5000 todos via seam (ms):" (js/Math.round (- t1 t0))))
