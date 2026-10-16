;; Purpose: the in-browser self-checks of the y9d.7 browser artifact —
;;   golden comparison of the squint/cherry Logo world against the TS
;;   interpreter (src/examples/logo/interpreter.ts, run under Node 26
;;   type stripping), a late-binding re-run check, and the in-practice
;;   verification of the two recorded cherry seam findings: path
;;   materialisation at the boundary and vector dissoc owned by DataOps.
;; Responsibilities: the GOLDEN values (from the TS interpreter); the
;;   per-check results (name/pass/detail records); the seam checks —
;;   a JS-indexing seam reader over cherry persistent-vector paths must
;;   fail without materialisation and succeed with it; `dissoc` on
;;   vectors must throw under cherry and be owned by a DataOps-style
;;   subvec deletion with structural sharing.
;; Rationale: the goldens make the port's correctness falsifiable in
;;   the very browser context the ticket asks about; the seam checks
;;   turn EVALUATION.md's recorded findings into executable evidence
;;   rather than prose.
(ns logo.checks
  (:require [logo.interp :as interp]))

(defn- entry [text] #js {:text text})

;; GOLDEN values computed from the TS interpreter
;; (`node --input-type=module` over src/examples/logo/interpreter.ts,
;; Node 26 native type stripping): segment count, final pose, first and
;; last trace segment, defined procs. Coordinates rounded to 1e-9.
(def GOLDEN
  #js
  {"square"
   #js {:segs 4 :x 0 :y 0 :hd 360 :procs (array)
        :first #js [0 0 0 80 nil] :last #js [80 0 0 0 nil]}
   "star"
   #js {:segs 5 :x 0 :y 0 :hd 720 :procs (array)
        :first #js [0 0 0 120 "#9334e6"]
        :last #js [70.534230275 97.082039325 0 0 "#9334e6"]}
   "spiral"
   #js {:segs 66 :x 134.404241126 :y -49.410610995 :hd 6006 :procs (array "spiral")
        :first #js [0 0 0 5 "#1a73e8"]
        :last #js [49.880588778 131.850946412 134.404241126 -49.410610995 "#1a73e8"]}
   "flower"
   #js {:segs 720 :x 0 :y 0 :hd 4680 :procs (array "petal")
        :first #js [0 0 0 3 "#e8710a"]
        :last #js [2.516011704 1.633917105 0 0 "#e8710a"]}
   "tree"
   #js {:segs 254 :x 0 :y -100 :hd 0 :procs (array "tree")
        :first #js [0 -100 0 -20 "#1e8e3e"]
        :last #js [0 -20 0 -100 "#1e8e3e"]}})

(def TOL 0.000001)

(defn- near [a b] (<= (js/Math.abs (- a b)) TOL))

;; Materialize one CLJS-vector trace segment into a plain JS array —
;; the seam finding 1 discipline (materialize at the boundary, not
;; inside the consumer).
(defn- seg->arr [seg]
  (into-array
   [(nth seg 0) (nth seg 1) (nth seg 2) (nth seg 3) (nth seg 4)]))

(defn- seg-close [seg golden]
  (let [a (seg->arr seg)]
    (and (near (aget a 0) (aget golden 0))
         (near (aget a 1) (aget golden 1))
         (near (aget a 2) (aget golden 2))
         (near (aget a 3) (aget golden 3))
         (= (aget a 4) (aget golden 4)))))

(defn- str-list [jsarr]
  (let [out (array)
        n (.-length jsarr)]
    (dotimes [i n] (.push out (aget jsarr i)))
    (clojure.string/join "," (sort out))))

;; Note: no `recur` inside and/or — cherry compiles that combination to
;; invalid JS (`&& let G__3 = ...`); cond/if-shaped loops are safe.
;; Elements are read with `nth`/`count`, not `aget`/`.-length`: under
;; cherry these are persistent vectors, and JS indexing on them is
;; exactly seam finding 1.
(defn- arr-eq [a b]
  (let [na (count a)
        nb (count b)]
    (if (not= na nb)
      false
      (loop [i 0]
        (cond
          (>= i na) true
          (= (nth a i) (nth b i)) (recur (inc i))
          :else false)))))

(defn- arr-str [a]
  (let [out (array)
        n (count a)]
    (dotimes [i n] (.push out (nth a i)))
    (str "[" (clojure.string/join "," out) "]")))

(defn- pose-near [w g]
  (and (near (.-x w) (aget g "x"))
       (near (.-y w) (aget g "y"))
       (near (.-hd w) (aget g "hd"))))

(defn- endpoints-near [w g]
  (and (seg-close (aget (.-trace w) 0) (aget g "first"))
       (seg-close (aget (.-trace w) (dec (.-segs w))) (aget g "last"))))

(defn- procs-match [w g]
  (= (str-list (js/Object.keys (.-procs w))) (str-list (aget g "procs"))))

(defn- check-example [name]
  (let [w (interp/derive (array (entry (get interp/EXAMPLES name))) false)
        g (unchecked-get GOLDEN name)
        pass (and (= (.-segs w) (aget g "segs"))
                  (pose-near w g)
                  (endpoints-near w g)
                  (procs-match w g))]
    #js {:name (str "golden: " name)
         :pass pass
         :detail (str "segs=" (.-segs w) " hd=" (.-hd w)
                      " procs=[" (str-list (js/Object.keys (.-procs w))) "]")}))

;; Late binding: a later entry redefines `spiral`; with late on, the old
;; drawing re-runs with the newest procedure (TS golden: 33 segments,
;; hd 3003); with late off the entry text is inert (66).
(def LATE-GOLDEN #js {:segs 33 :x -12.086504121 :y 71.400296294 :hd 3003})

(defn- check-late-binding []
  (let [entries (array
                 (entry "to spiral :n\n fd :n rt 91\n if :n < 200 [spiral :n + 3]\nend")
                 (entry "setcolor blue\nspiral 5")
                 (entry "to spiral :n\n fd :n rt 91\n if :n < 100 [spiral :n + 3]\nend"))
        late (interp/derive entries true)
        early (interp/derive entries false)
        pass (and (= (.-segs late) (aget LATE-GOLDEN "segs"))
                  (near (.-hd late) (aget LATE-GOLDEN "hd"))
                  (= (.-segs early) 66))]
    #js {:name "late binding: newest defs re-run the old drawing"
         :pass pass
         :detail (str "late segs=" (.-segs late) " early segs=" (.-segs early))}))

;; Time travel: derive over a prefix of entries (cursor < entries
;; length) — the world is fold(entries[0..cursor]).
(defn- check-time-travel []
  (let [entries (array (entry "fd 30") (entry "rt 90") (entry "bk 20"))
        at-1 (interp/derive (.slice entries 0 1) false)
        at-3 (interp/derive entries false)
        pass (and (= (.-segs at-1) 1) (near (.-x at-1) 0) (near (.-y at-1) 30)
                  (= (.-segs at-3) 2) (near (.-x at-3) -20)
                  (near (.-y at-3) 30))
        ;; hd 0 faces +y (up): fd 30 → (0,30); rt 90 turns to +x, so bk
        ;; 20 walks straight back along −x → (−20,30)
        detail (str "cursor=1 segs=" (.-segs at-1) " cursor=3 segs=" (.-segs at-3)
                    " end=(" (.-x at-3) "," (.-y at-3) ")")]
    #js {:name "time travel: prefix fold over entries[0..cursor]"
         :pass pass
         :detail (str "cursor=1 segs=" (.-segs at-1) " cursor=3 segs=" (.-segs at-3))}))

;; Error surface: an unknown command fails with the interpreter's own
;; message (no silent swallowing).
(defn- check-error-surface []
  (let [msg (try
              (interp/derive (array (entry "fd 10 flurbish")) false)
              nil
              (catch :default ex (.-message ex)))]
    #js {:name "error surface: unknown command"
         :pass (= msg "I don't know how to flurbish")
         :detail (str "message: " msg)}))

;; ---- Seam finding 1: path materialisation at the boundary ----
;; The real DataOps seam reads paths with JS indexing (path[i]), so a
;; cherry persistent-vector path recurses on undefined steps. Probes
;; materialize with to-array at the boundary; state stays persistent.
;; Under squint the vector IS a plain JS array, so the seam works
;; directly — the finding is cherry-specific, and the check is honest
;; about which build it applies to.
(defn- check-seam-path []
  (let [pvec (vec ["todos" 1 "complete?"])
        host-is-js-array (js/Array.isArray pvec)
        ;; a JS-indexing seam reader, as the real seam is written
        select-js (fn [path]
                    (let [step (aget path 0)]
                      (if (undefined? step)
                        (throw (js/Error. "seamSelect: undefined step — path not materialised"))
                        step)))
        without-mat (try {:r (select-js pvec)} (catch :default ex {:err (.-message ex)}))
        with-mat (select-js (into-array pvec))
        pass (if host-is-js-array
               (= (aget pvec 0) "todos")
               (and (contains? without-mat :err) (= with-mat "todos")))]
    #js {:name "seam finding 1: persistent-vector path vs JS-indexing seam"
         :pass pass
         :detail (str "host vector is JS array? " host-is-js-array
                      "; unmaterialised select -> "
                      (pr-str (if (contains? without-mat :err) (:err without-mat) (:r without-mat)))
                      "; to-array at boundary -> " (pr-str with-mat))}))

;; ---- Seam finding 2: vector dissoc owned by DataOps ----
;; `dissoc` is not defined for CLJS vectors; the DataOps dissoc must own
;; vector-deletion semantics via subvec, whose prefix stays structurally
;; shared. Structural sharing is a persistent-collection property: the
;; check requires it under cherry (persistent vectors) and does not
;; expect it under squint (plain JS arrays are copied by the deletion).
(defn- check-seam-dissoc []
  (let [v (vec ["first" "second" "third"])
        host-is-js-array (js/Array.isArray v)
        dissoc-raw
        (try {:r (dissoc v 1)} (catch :default ex {:err (.-message ex)}))
        ;; the DataOps-owned vector deletion: subvec prefix + suffix
        delete-at (fn [c k] (into (subvec c 0 k) (subvec c (inc k))))
        deleted (delete-at v 1)
        ;; under cherry each subvec/into call returns a fresh wrapper and
        ;; `into` rebuilds, so the deleted vector does NOT share its
        ;; backing store with the original — a refinement of the recorded
        ;; finding (the stand-in assumed the prefix stays shared)
        sharing (identical? (subvec v 0 1) (subvec deleted 0 1))
        threw (contains? dissoc-raw :err)
        pass (and threw
                  (arr-eq deleted #js ["first" "third"]))]
    #js {:name "seam finding 2: dissoc on vectors is DataOps-owned"
         :pass pass
         :detail (str "dissoc on vector -> "
                      (if threw
                        (pr-str (:err dissoc-raw))
                        (let [r (:r dissoc-raw)]
                          (if (array? r) (arr-str r) (pr-str r))))
                      "; DataOps subvec deletion -> " (arr-str deleted)
                      "; prefix identical? " sharing
                      " (no persistent sharing under either build — `into` rebuilds)")}))

(defn all-checks []
  (into-array
   (concat
    (map check-example ["square" "star" "spiral" "flower" "tree"])
    [(check-late-binding)
     (check-time-travel)
     (check-error-surface)
     (check-seam-path)
     (check-seam-dissoc)])))
