;; Purpose: the Logo interpreter of the Logo world, ported 1:1 from
;;   src/examples/logo/interpreter.ts into squint/cherry-compatible
;;   ClojureScript for the y9d.7 browser-artifact assessment. The world
;;   is never stored: it is derived as a pure fold over the source
;;   entries, `world = fold(entries[0..cursor])`.
;; Responsibilities: the pen-color table and example programs; move and
;;   trace recording; the COMMANDS dispatch table over named handlers
;;   (fd/bk/rt/lt, pu/pd, home, setcolor, repeat, if, stop);
;;   defined-procedure invocation with depth guarding;
;;   derive(entries, late) — all definitions applied first when late is
;;   on, then every command re-run.
;; Rationale: src/examples/logo/interpreter.ts is the design authority;
;;   the port changes presentation only. The world builder is a #js
;;   record (mutable during the fold, projected readonly by derive), and
;;   trace segments are CLJS vectors — materialized to plain arrays only
;;   at the presentation boundary (seam finding 1's discipline).
(ns logo.interp
  (:require [logo.expr :as e]))

(def COLORS
  #js {"red" "#d93025", "green" "#1e8e3e", "blue" "#1a73e8"
       "orange" "#e8710a", "purple" "#9334e6", "black" nil})

;; The example programs of the demo (the original EXAMPLES, verbatim).
(def EXAMPLES
  {"square" "repeat 4 [fd 80 rt 90]"
   "star" "setcolor purple\nrepeat 5 [fd 120 rt 144]"
   "spiral" "to spiral :n\n fd :n rt 91\n if :n < 200 [spiral :n + 3]\nend\nsetcolor blue\nspiral 5"
   "flower" "to petal\n repeat 2 [repeat 30 [fd 3 rt 3] rt 90]\nend\nsetcolor orange\nrepeat 12 [petal rt 30]"
   "tree" "to tree :s\n if :s < 8 [stop]\n fd :s lt 25 tree :s * 0.7\n rt 50 tree :s * 0.7\n lt 25 bk :s\nend\nsetcolor green\npu bk 100 pd\ntree 80"})

;; The step budget and recursion depth guard (the demo's two runaway
;; protections, same limits as the original).
(def ^:const STEP-BUDGET 30000)
(def ^:const TRACE-CAP 20000)
(def ^:const MAX-DEPTH 150)

(declare exec-reader)

(defn- move [w d]
  (let [r (/ (* (.-hd w) js/Math.PI) 180)
        nx (+ (.-x w) (* d (js/Math.sin r)))
        ny (+ (.-y w) (* d (js/Math.cos r)))]
    (when (and (.-pen w) (< (.-length (.-trace w)) TRACE-CAP))
      (.push (.-trace w) [(.-x w) (.-y w) nx ny (.-color w)]))
    (set! (.-x w) nx)
    (set! (.-y w) ny)))

;; The command handlers behind the dispatch table: one named function
;; per drawing command (the split-handler convention of the COMMANDS
;; dispatch table), each reading its arguments from the token stream in
;; order.
(defn- fwd! [c]
  (move (.-w c) (e/num (e/expr (.-P c) (.-env c)))))

(defn- back! [c]
  (move (.-w c) (- (e/num (e/expr (.-P c) (.-env c))))))

(defn- rt! [c]
  (set! (.-hd (.-w c)) (+ (.-hd (.-w c)) (e/num (e/expr (.-P c) (.-env c))))))

(defn- lt! [c]
  (set! (.-hd (.-w c)) (- (.-hd (.-w c)) (e/num (e/expr (.-P c) (.-env c))))))

(defn- pu! [c] (set! (.-pen (.-w c)) false))

(defn- pd! [c] (set! (.-pen (.-w c)) true))

(defn- home! [c]
  (let [w (.-w c)]
    (set! (.-x w) 0)
    (set! (.-y w) 0)
    (set! (.-hd w) 0)))

(defn- setcolor! [c]
  (let [P (.-P c)
        w (.-w c)
        name (aget (aget P "t") (.-i P))]
    (set! (.-i P) (inc (.-i P)))
    (when-not (js-in name COLORS)
      (throw (js/Error. (str "unknown color " name))))
    (set! (.-color w) (unchecked-get COLORS name))))

(defn- repeat! [c]
  (let [n (e/num (e/expr (.-P c) (.-env c)))
        body (e/read-block! (.-P c))]
    (dotimes [k n]
      (exec-reader #js {:t body :i 0} (.-env c) (.-w c) (.-depth c)))))

(defn- if! [c]
  (let [test (e/expr (.-P c) (.-env c))
        body (e/read-block! (.-P c))]
    (when test
      (exec-reader #js {:t body :i 0} (.-env c) (.-w c) (.-depth c)))))

(defn- stop! [_c]
  (let [ex (js/Error. "stop")]
    (set! (.-logoStop ex) true)
    (throw ex)))

;; The command dispatch table: one handler per drawing command.
(def COMMANDS
  {"fd" fwd!, "forward" fwd!
   "bk" back!, "back" back!
   "rt" rt!, "right" rt!
   "lt" lt!, "left" lt!
   "pu" pu!, "pd" pd!, "home" home!
   "setcolor" setcolor!, "repeat" repeat!, "if" if!, "stop" stop!})

(defn- stop? [ex] (boolean (.-logoStop ex)))

;; Invoke a defined procedure: bind its params from the argument
;; expressions, run its body one level deeper; a `stop` inside the body
;; ends only that invocation.
(defn- call-proc [proc P env w depth]
  (when (> depth MAX-DEPTH)
    (throw (js/Error. "recursion too deep")))
  (let [params (aget proc "params")
        env2 (loop [k 0 env2 {}]
               (if (< k (.-length params))
                 (recur (inc k) (assoc env2 (aget params k) (e/num (e/expr P env))))
                 env2))]
    (try
      (exec-reader #js {:t (aget proc "body") :i 0} env2 w (inc depth))
      (catch :default ex
        (when-not (stop? ex)
          (throw ex))))))

;; One command token: dispatch-table handler if known, else a defined
;; procedure, else the Logo error.
(defn- exec-tok [tok P env w depth]
  (let [cmd (get COMMANDS tok)]
    (cond
      cmd (cmd #js {:P P :env env :w w :depth depth})
      (unchecked-get (.-procs w) tok) (call-proc (unchecked-get (.-procs w) tok) P env w depth)
      :else (throw (js/Error. (str "I don't know how to " tok))))))

(defn- exec-reader [P env w depth]
  (let [t (aget P "t")
        n (.-length t)]
    (loop []
      (when (< (.-i P) n)
        (let [tok (aget t (.-i P))]
          (set! (.-i P) (inc (.-i P)))
          (set! (.-steps w) (inc (.-steps w)))
          (when (> (.-steps w) STEP-BUDGET)
            (throw (js/Error. "too many steps — infinite loop?")))
          (exec-tok tok P env w depth)
          (recur))))))

(defn- fresh-world []
  #js {:procs #js {} :x 0 :y 0 :hd 0 :pen true :color nil :trace (array) :steps 0})

(defn- freeze-world [w]
  #js {:procs (.-procs w) :x (.-x w) :y (.-y w) :hd (.-hd w)
       :pen (.-pen w) :color (.-color w) :trace (.-trace w) :steps (.-steps w)
       :segs (.-length (.-trace w))})

;; Derive the world: every entry runs as a fold step. With `late`, all
;; definitions are applied first, then every command re-runs — the old
;; drawing redrawn with the newest procedures. `to`/`end` tokens never
;; execute: definitions are registered by the fold. Entries are a JS
;; array of #js {:text} records.
(defn derive [entries late]
  (let [w (fresh-world)
        toks (into-array (map #(e/tokenize (.-text %)) entries))]
    (when late
      (doseq [t toks] (e/defs-of! t (.-procs w))))
    (doseq [t toks]
      (when-not late
        (e/defs-of! t (.-procs w)))
      (exec-reader #js {:t (e/strip-defs t) :i 0} {} w 0))
    (freeze-world w)))
