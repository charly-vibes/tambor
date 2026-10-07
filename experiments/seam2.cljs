(ns seam2 (:require ["./tambor-ops.mjs" :as m]))
(def state {:todos (vec (for [i (range 5000)] {:description (str "t" i) :complete? false})) :n 1})
(let [r (m/dispatch state [[:update [:todos 2 :complete?] not] [:update [:n] inc]])]
  (js/console.log "n:" (:n r) "shared:" (identical? (get-in state [:todos 3]) (get-in r [:todos 3]))))
(let [t0 (js/performance.now)
      _ (dotimes [_ 1000] (m/dispatch state [[:update [:todos 7 :complete?] not]]))
      t1 (js/performance.now)]
  (js/console.log "1000 dispatches (ms):" (js/Math.round (- t1 t0))))
