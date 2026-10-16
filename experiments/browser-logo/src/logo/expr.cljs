;; Purpose: the Logo tokenizer and expression reader of the Logo world,
;;   ported 1:1 from src/examples/logo/expr.ts into squint/cherry-compatible
;;   ClojureScript for the y9d.7 browser-artifact assessment.
;; Responsibilities: tokenize (comment stripping, bracket splitting,
;;   lowercasing); strip-defs (skip `to … end` bodies — registration
;;   happens in the fold); defs-of! (collect `to name :params body end`
;;   into a JS procs record); read-block! (balanced-bracket block reader);
;;   num (truthy boolean → number coercion); the expression grammar
;;   expr/sum/term/fac with :variable lookup.
;; Rationale: src/examples/logo is the design authority; the port changes
;;   presentation only. Token streams are plain JS arrays and the reader
;;   is a #js {:t :i} record — both mutable the same way squint and cherry
;;   emit — so the two builds share one source with no fork.
(ns logo.expr)

(defn tokenize [src]
  (into-array
   (filterv not-empty
            (clojure.string/split
             (-> src
                 (clojure.string/replace #";.*" "")
                 (clojure.string/replace #"[[\]()]" " $& ")
                 clojure.string/lower-case)
             #"\s+"))))

;; Skip the body of a `to … end` definition.
(defn strip-defs [toks]
  (let [out (array)
        n (.-length toks)]
    (loop [i 0 skipping false]
      (if (>= i n)
        out
        (let [t (aget toks i)]
          (cond
            skipping (recur (inc i) (not= t "end"))
            (= t "to") (recur (inc i) true)
            :else (do (.push out t) (recur (inc i) skipping))))))))

;; Collect the `:params` of one definition (the tokens from after the
;; name until the first non-`:` token).
(defn- collect-params [toks j]
  (loop [j j ps []]
    (if (clojure.string/starts-with? (or (aget toks j) "") ":")
      (recur (inc j) (conj ps (subs (aget toks j) 1)))
      [j ps])))

;; Collect the body tokens of one definition (up to `end` or stream end).
(defn- collect-body [toks n j]
  (loop [j j body []]
    (if (and (< j n) (not= (aget toks j) "end"))
      (recur (inc j) (conj body (aget toks j)))
      [j body])))

;; Collect the `to … end` definitions of one token stream into the procs
;; record (a plain JS object keyed by procedure name).
(defn defs-of! [toks procs]
  (let [n (.-length toks)]
    (loop [i 0]
      (when (< i n)
        (if (= (aget toks i) "to")
          (let [pname (aget toks (inc i))
                [j params] (collect-params toks (+ i 2))
                [j body] (collect-body toks n j)]
            (aset procs pname #js {:params (into-array params) :body (into-array body)})
            (recur (inc j)))
          (recur (inc i)))))))

;; Bracket class of one token: [ opens, ] closes, other stays.
(defn- depth-step [c depth]
  (cond (= c "[") (inc depth)
        (= c "]") (dec depth)
        :else depth))

;; Scan to the matching ]; leaves P.i one past the ] (or throws).
(defn- scan-block! [t n P]
  (loop [depth 0]
    (let [i (.-i P)
          d (depth-step (aget t i) depth)]
      (set! (.-i P) (inc i))
      (cond
        (> d 0) (if (> (inc i) n)
                  (throw (js/Error. "missing ]"))
                  (recur d))
        :else d))))

;; Balanced-bracket block reader: the tokens between [ and its match.
(defn read-block! [P]
  (let [t (aget P "t")
        n (.-length t)
        start (.-i P)]
    (when-not (= "[" (aget t start))
      (throw (js/Error. "expected [")))
    (let [depth (scan-block! t n P)]
      (when-not (zero? depth)
        (throw (js/Error. "missing ]")))
      (.slice t (inc start) (dec (.-i P))))))

;; Arithmetic contexts coerce the boolean comparison result truthily.
(defn num [v]
  (if (number? v) v (if v 1 0)))

(declare expr)

;; sum = term ((+|-) term)*
(defn- sum [P env]
  (loop [a (term P env)]
    (let [t (aget (aget P "t") (.-i P))]
      (if (or (= t "+") (= t "-"))
        (do (set! (.-i P) (inc (.-i P)))
            (recur (if (= t "+") (+ a (term P env)) (- a (term P env)))))
        a))))

;; term = fac ((*|/) fac)*
(defn- term [P env]
  (loop [a (fac P env)]
    (let [t (aget (aget P "t") (.-i P))]
      (if (or (= t "*") (= t "/"))
        (do (set! (.-i P) (inc (.-i P)))
            (recur (if (= t "*") (* a (fac P env)) (/ a (fac P env)))))
        a))))

;; A parenthesised expression: the value plus the closing `)`.
(defn- paren-value [P env]
  (let [v (expr P env)]
    (set! (.-i P) (inc (.-i P)))
    (num v)))

;; A :variable lookup; unbound variables are an error (as in Logo).
(defn- var-value [t env]
  (let [k (subs t 1)]
    (when-not (contains? env k)
      (throw (js/Error. (str "no value for :" k))))
    (get env k)))

;; A numeric literal; non-numbers are an error.
(defn- number-value [t]
  (let [n (js/Number t)]
    (if (js/isNaN n)
      (throw (js/Error. (str "a number was expected, got " t)))
      n)))

;; fac = number | :var | (expr) | -fac
(defn- fac [P env]
  (let [i (.-i P)
        t (aget (aget P "t") i)]
    (set! (.-i P) (inc i))
    (when (undefined? t)
      (throw (js/Error. "a number was expected")))
    (cond
      (= t "-") (- (fac P env))
      (= t "(") (paren-value P env)
      (= ":" (subs t 0 1)) (var-value t env)
      :else (number-value t))))

;; expr = sum ((<|>|=) sum)? — comparisons return a boolean consumed
;; truthily by `if`.
(defn expr [P env]
  (let [a (sum P env)
        t (aget (aget P "t") (.-i P))]
    (if (or (= t "<") (= t ">") (= t "="))
      (do (set! (.-i P) (inc (.-i P)))
          (let [b (sum P env)]
            (cond (= t "<") (< a b)
                  (= t ">") (> a b)
                  :else (= a b))))
      a)))
