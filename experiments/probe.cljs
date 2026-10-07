(ns probe
  (:require ["./tambor-lite.mjs" :as m]))

;; 1. data literals, keywords, nesting
(def state {:todos [{:description "first" :complete? false}
                    {:description "second" :complete? false}]
            :next-todo-text ""})

;; 2. effects as plain vectors with keyword tags and a Clojure fn as the update fn
(def batch [[:update [:todos 1 :complete?] not]
            [:set [:next-todo-text] "hello"]
            [:bogus [:x] 1]])

(def result (m/dispatch state batch))
(js/console.log "result" (js/JSON.stringify result))
(js/console.log "sibling shared?" (identical? (:todos state) (:todos result)))
(js/console.log "untouched todo shared?" (identical? (get-in state [:todos 0]) (get-in result [:todos 0])))
(js/console.log "input unchanged?" (js/JSON.stringify state))

;; 3. views are plain objects; destructuring and threading work as usual
(let [{:keys [type children]} (m/vstack (m/label "a") (m/label "b"))]
  (js/console.log "view" type (count children)))

;; 4. namespaced and auto-resolved keywords, sets, nil
(js/console.log "kw" (js/JSON.stringify [:foo :bar/baz ::auto]))
(js/console.log "set" (js/JSON.stringify (js/Array.from #{1 2})) (type #{1 2}))
(js/console.log "nil path" (m/select state [:nope :deeper]))

;; 5. handler returning effects, as a component would
(defn on-click [] [[:update [:n] inc]])
(js/console.log "handler" (js/JSON.stringify (on-click)))
(js/console.log (js/JSON.stringify (m/dispatch {:n 1} (on-click))))
