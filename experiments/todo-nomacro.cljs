(ns todo-nomacro
  (:require ["./tambor-paths.mjs" :as m]))

(def filter-fns {:all (constantly true) :active (complement :complete?) :complete? :complete?})

;; a "component": plain fn of props -> view data; every state change is an effect carrying a path
(defn todo-item [{:keys [todo $todo]}]
  {:type "row"
   :delete   {:on-mouse-down (fn [] [[:delete $todo]])}
   :checkbox {:checked? (:complete? todo)
              :on-mouse-down (fn [] [[:update (conj $todo :complete?) not]])}
   :text     (:description todo)})

(defn todo-list [{:keys [todos $todos selected-filter]}]
  (let [pred     (get filter-fns selected-filter (:all filter-fns))
        visible  (filter pred todos)                    ; the filtered view the user sees
        $visible (conj $todos (m/filter pred))]         ; same path macro would derive for filter
    (m/each visible $visible (fn [todo $todo] (todo-item {:todo todo :$todo $todo})))))

(def state {:todos [{:description "first" :complete? false}
                    {:description "second" :complete? false}
                    {:description "third" :complete? true}]
            :selected-filter :active})

(let [rows (todo-list {:todos (:todos state) :$todos [:todos] :selected-filter :active})
      _ (js/console.log "visible rows:" (js/JSON.stringify (mapv :text rows)))
      ;; user taps delete on visible index 1 ("second")
      effs ((get-in (nth rows 1) [:delete :on-mouse-down]))
      after (m/dispatch state effs)]
  (js/console.log "delete effect path:" (js/JSON.stringify (second (first effs)) (fn [k v] (if (fn? v) "<filter>" v))))
  (js/console.log "after delete:" (js/JSON.stringify (mapv :description (:todos after))))
  ;; toggle visible index 0 through the filter path
  (let [effs2 ((get-in (nth rows 0) [:checkbox :on-mouse-down]))
        after2 (m/dispatch state effs2)]
    (js/console.log "after toggle first:" (js/JSON.stringify (mapv :complete? (:todos after2))))))
