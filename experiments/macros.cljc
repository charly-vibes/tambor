(ns macros)
(defmacro defui [name [props] & body]
  `(defn ~name [~props] (js/console.log "defui expanded for" ~(str name)) ~@body))
