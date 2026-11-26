import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const toast = useCallback((message, type = "success") => {
    const id = crypto.randomUUID();
    setToasts((previous) => [...previous.slice(-3), { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
      timers.current.delete(timer);
    }, 6500);
    timers.current.add(timer);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div className={`toast ${item.type}`} key={item.id}>
            {item.type === "error" ? (
              <CircleAlert size={20} />
            ) : (
              <CheckCircle2 size={20} />
            )}
            <span>{item.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((previous) =>
                  previous.filter((value) => value.id !== item.id),
                )
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
