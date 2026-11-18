import { useEffect, useState } from "react";

// The visible part of the screen (visualViewport, without the keyboard): full-screen phone views size to it. `lockBody`
// stops the page behind from scrolling until the last locking view is gone.
let locks = 0;
let savedOverflow = "";

export function useVisualViewport(lockBody = true) {
  const measure = () => ({ top: window.visualViewport?.offsetTop ?? 0, height: window.visualViewport?.height ?? window.innerHeight });
  const [viewport, setViewport] = useState(measure);
  useEffect(() => {
    const update = () => setViewport(measure());
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    if (lockBody) {
      if (locks === 0) savedOverflow = document.body.style.overflow;
      locks += 1;
      document.body.style.overflow = "hidden";
    }
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (lockBody) {
        locks -= 1;
        if (locks === 0) document.body.style.overflow = savedOverflow;
      }
    };
  }, [lockBody]);
  return viewport;
}
