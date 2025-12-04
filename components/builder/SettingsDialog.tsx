"use client";

import { useTheme, AppTheme } from "@/contexts/ThemeContext";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const themes: { id: AppTheme; name: string; description: string }[] = [
  { id: "light", name: "Light", description: "Clean, bright interface" },
  { id: "dark", name: "Dark", description: "Easy on the eyes" },
  { id: "solarized-light", name: "Solarized Light", description: "Warm, low-contrast light theme" },
  { id: "solarized-dark", name: "Solarized Dark", description: "Classic dark theme for developers" },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();

  if (!isOpen) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Settings</h3>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Theme</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`btn btn-sm justify-start h-auto py-3 ${
                  theme === t.id ? "btn-primary" : "btn-ghost"
                }`}
              >
                <div className="text-left">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs opacity-70">{t.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
