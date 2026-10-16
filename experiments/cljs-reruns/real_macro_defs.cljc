(ns real-macro-defs)

;; defui macro: tier-3 sugar over the explicit tier-2 API (EVALUATION.md).
;; Expands to a plain fn using real path derivation the caller composes in.
(defmacro defui [name [props] & body]
  `(defn ~name [~props] ~@body))
