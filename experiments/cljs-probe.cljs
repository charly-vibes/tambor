(ns cljs-probe
  (:require ["./tambor-lite.mjs" :as m]))

(def state {:todos [{:description "first" :complete? false}] :n 1})

(js/console.log "1 direct call:"
  (try (m/select state [:todos 0 :description]) (catch :default e (str "THROWS " (.-message e)))))

(let [js-state (clj->js state)]
  (js/console.log "2 converted:" (js/JSON.stringify js-state))
  (js/console.log "2 select after conversion:" (m/select js-state #js ["todos" 0 "description"]))
  (js/console.log "2 identity kept across conversions:" (identical? (clj->js state) (clj->js state)))
  (js/console.log "2 path keywords need conversion too:"
    (try (m/select js-state #js [:todos 0 :description]) (catch :default e "THROWS"))))
(js/console.log "2 ns keywords:" (js/JSON.stringify (clj->js [:ui/select :a/b])))
(js/console.log "3 keyword is string?" (string? :update) "| keyword is" (type :update))

;; 4. cost: convert a 5000-todo state on every render vs once
(let [big {:todos (vec (for [i (range 5000)] {:description (str "t" i) :complete? false}))}
      t0 (js/performance.now)
      _ (dotimes [_ 20] (clj->js big))
      t1 (js/performance.now)]
  (js/console.log "4 clj->js x20 on 5000 todos (ms):" (js/Math.round (- t1 t0))))
