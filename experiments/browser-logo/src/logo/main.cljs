;; Purpose: the browser mount of the y9d.7 Logo world artifact — runs
;;   the in-browser self-checks, renders each example program's derived
;;   world as an SVG turtle canvas, publishes the results on
;;   window.__results for the headless evidence runner, and degrades to
;;   a console JSON report when the same bundle runs under Node.
;; Responsibilities: build identification (squint vs cherry from the
;;   artifact path); the SVG rendering of a derived World (trace
;;   segments as colored paths, the turtle triangle at the final pose);
;;   the checks list rendering; window.__results.
;; Rationale: the artifact is the ticket's evidence: the world compiles
;;   AND runs in a browser under a strict CSP (script-src 'self'), with
;;   the seam findings verified live. innerHTML + no inline scripts
;;   keeps the page CSP-clean; the checks run before render so a failure
;;   is visible on the page itself. Trace segments (CLJS vectors inside
;;   a JS array) are materialized here — at the presentation boundary —
;;   per seam finding 1's discipline.
(ns logo.main
  (:require [logo.checks :as checks]
            [logo.interp :as interp]))

(def build-id
  (let [path (if (exists? js/location) js/location.pathname "node")]
    (if (clojure.string/includes? path "cherry")
      "cherry"
      "squint")))

(def INK "#111111")
(def TURTLE "#b2261f")

;; One trace segment as an SVG path (the segment is a CLJS vector;
;; materialized here — at the presentation boundary — per seam finding 1).
(defn- seg-svg [seg]
  (str "<path d=\"M" (nth seg 0) " " (nth seg 1)
       " L" (nth seg 2) " " (nth seg 3)
       "\" stroke=\"" (or (nth seg 4) INK)
       "\" stroke-width=\"2\" fill=\"none\"/>"))

(defn- segs-svg [trace]
  (let [out (array)
        n (.-length trace)]
    (dotimes [i n]
      (.push out (seg-svg (aget trace i))))
    (clojure.string/join "" out)))

;; The turtle marker: a small triangle at the final heading.
(defn- turtle-svg [x y hd]
  (let [r (/ (* hd js/Math.PI) 180)
        dx (js/Math.sin r)
        dy (js/Math.cos r)]
    (str "<polygon points=\""
         x "," y " "
         (- x (* 3 dy)) "," (+ y (* 3 dx)) " "
         (+ x (* 3 dy)) "," (- y (* 3 dx))
         "\" fill=\"" TURTLE "\"/>")))

(defn- svg-of [w]
  (str "<svg viewBox=\"-210 -210 420 420\" width=\"300\" height=\"300\" role=\"img\">"
       "<rect x=\"-210\" y=\"-210\" width=\"420\" height=\"420\" fill=\"#faf8f5\"/>"
       "<g transform=\"scale(1,-1)\">" (segs-svg (.-trace w))
       "<g transform=\"scale(1,-1)\">" (turtle-svg (.-x w) (.-y w) (.-hd w)) "</g></g>"
       "</svg>"))

(defn- example-section [name]
  (str "<figure><figcaption>" name "</figcaption>"
       (try
         (svg-of (interp/derive (array #js {:text (get interp/EXAMPLES name)}) false))
         (catch :default ex (str "<em>" (.-message ex) "</em>")))
       "</figure>"))

(defn- checks-list [results]
  (let [out (array)
        n (.-length results)]
    (dotimes [i n]
      (let [r (aget results i)]
        (.push out
               (str "<li data-pass=\"" (.-pass r) "\"><strong>"
                    (if (.-pass r) "PASS" "FAIL") "</strong> — "
                    (.-name r) " <code>" (.-detail r) "</code></li>"))))
    (clojure.string/join "" out)))

(defn- render! [results]
  ;; the example names come from the namespace VALUE, not a `.-EXAMPLES`
  ;; JS property read — under cherry the compiled namespace object is not
  ;; plain data and `Object.keys` on it returns internal fields, not map
  ;; keys (a boundary-discipline lesson in itself)
  (let [el (js/document.getElementById "app")
        names (sort (keys interp/EXAMPLES))
        sections (array)
        n (count names)]
    (dotimes [i n]
      (.push sections (example-section (nth names i))))
    (set! (.-innerHTML el)
          (str "<h1>Logo world — " build-id " build</h1>"
               "<ul id=\"checks\">" (checks-list results) "</ul>"
               (clojure.string/join "" sections)))))

(def results (checks/all-checks))

(defn- all-pass? [results]
  (let [n (.-length results)]
    (loop [i 0]
      (cond
        (>= i n) true
        (.-pass (aget results i)) (recur (inc i))
        :else false))))

(defn- summary [results]
  #js {:build build-id
       :pass (all-pass? results)
       :checks (into-array
                (for [i (range (.-length results))]
                  (let [r (aget results i)]
                    #js {:name (.-name r) :pass (.-pass r) :detail (.-detail r)})))})

(when (exists? js/document)
  (render! results)
  (set! js/window.__results (js/JSON.parse (js/JSON.stringify (summary results)))))

(when-not (exists? js/document)
  ;; headless Node smoke run: the same checks, JSON to stdout
  (js/console.log (js/JSON.stringify (summary results))))
