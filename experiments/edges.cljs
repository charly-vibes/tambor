(ns edges
  (:require ["./tambor-lite.mjs" :as m]))

(def s {:a {:x 1} :b {:y 2}})

;; A. squint's own assoc/update: copy or mutate? sharing?
(let [s2 (assoc-in s [:a :x] 99)]
  (js/console.log "A assoc-in input untouched:" (js/JSON.stringify s)
                  "| b shared:" (identical? (:b s) (:b s2))))
(let [s2 (update s :a assoc :x 5)]
  (js/console.log "A update copy:" (not (identical? s s2)) (js/JSON.stringify s)))

;; B. lazy results: what does map/for/filter return?
(let [xs (map m/label ["a" "b"])]
  (js/console.log "B map is array?" (js/Array.isArray xs) "| iterable?" (some? (aget xs js/Symbol.iterator))))
(js/console.log "B mapv is array?" (js/Array.isArray (mapv m/label ["a" "b"])))
(js/console.log "B for is array?" (js/Array.isArray (for [t ["a" "b"]] (m/label t))))
(js/console.log "B into [] is array?" (js/Array.isArray (into [] (map m/label ["a"]))))

;; C. calling the lib with a lazy children list (variadic and array forms)
(let [v (apply m/vstack (map m/label ["a" "b"]))]
  (js/console.log "C apply vstack children array?" (js/Array.isArray (:children v))))

;; D. $-prefixed keys, ? keys, keyword-as-fn, namespaced effect tags
(let [props {:num 10 :$num [:num] :complete? true}]
  (js/console.log "D" (js/JSON.stringify props) (:$num props) (:complete? props)))
(js/console.log "D tag" (js/JSON.stringify [::counter-increment :ui/select]))

;; E. nil vs undefined from squint
(js/console.log "E get missing:" (get {} :x) "| nil literal:" nil "| nil? both:" (nil? nil) (nil? js/undefined))

;; F. vectors as paths mixing keys and indexes survive
(js/console.log "F" (m/select {:todos [{:d "x"}]} [:todos 0 :d]))

;; G. multi-arity + rest args pass through
(defn f ([a] (m/vstack a)) ([a & more] (apply m/vstack a more)))
(js/console.log "G" (count (:children (f (m/label "a") (m/label "b") (m/label "c")))))
