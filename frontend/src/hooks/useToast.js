// import { useState } from "react";

// export function useToast() {
//   const [toasts, setToasts] = useState([]);

//   const show = (msg, type = "info") => {
//     const id = Date.now();
//     setToasts((t) => [...t, { id, msg, type }]);

//     setTimeout(() => {
//       setToasts((t) => t.filter((x) => x.id !== id));
//     }, 4000);
//   };

//   return { toasts, show };
// }


import { useState, useCallback } from "react";

/**
 * Lightweight toast notification system.
 * Returns toasts array + a toast(msg, type) function.
 * Toasts auto-dismiss after 4.8 s.
 */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4800
    );
  }, []);

  return { toasts, toast };
};
