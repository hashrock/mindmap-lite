import { t } from "../application/i18n";
import { useLocale } from "./useLocale";

interface Props {
  /** Current `MindMapModel.multiRoot` (absent counts as `true`). */
  multiRoot: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Per-note single/multi-root display preference, rendered next to
 * {@link PublicityDropdown} in the editor header. `false` just hides the
 * empty-canvas "add root" menu item — it is not an invariant, so `addRootAt`
 * itself stays unconditional and existing multi-tree notes are left as-is.
 * There is nothing else to configure beyond the flag, hence a plain toggle
 * rather than a dropdown.
 */
export default function MultiRootToggle({ multiRoot, onChange }: Props) {
  useLocale(); // 言語切り替えで再レンダー（t() の購読）
  return (
    <button
      type="button"
      onClick={() => onChange(!multiRoot)}
      aria-pressed={multiRoot}
      title={multiRoot ? t("multiRootToggleOnDesc") : t("multiRootToggleOffDesc")}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {multiRoot ? t("multiRootToggleOn") : t("multiRootToggleOff")}
    </button>
  );
}
