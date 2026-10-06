(ns usemacro
  (:require-macros [macros :refer [defui]]))
(defui counter [{:keys [num]}] (js/console.log "num" num) [:label num])
(counter {:num 3})
