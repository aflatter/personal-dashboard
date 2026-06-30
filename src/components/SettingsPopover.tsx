import { Popover } from '@base-ui/react/popover';
import { Switch } from '@base-ui/react/switch';
import { NumberField } from '@base-ui/react/number-field';
import { useDashboardStore } from '../store/DashboardContext';

/** Header settings: configurable thresholds + clock seconds (SPEC "tweaks"). */
export function SettingsPopover() {
  const { state, updateSettings } = useDashboardStore();
  const { settings } = state;

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Einstellungen"
        className="tnum text-[15px] leading-none text-muted bg-transparent border-0 cursor-pointer p-1 transition-colors duration-150 hover:text-ink"
      >
        ⚙
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="bg-card border border-card-border rounded-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] p-4 w-[240px] outline-none">
            <div className="text-[13px] font-semibold mb-3">Einstellungen</div>

            <div className="flex flex-col gap-3 text-[13px] text-secondary">
              <label className="flex items-center justify-between gap-3">
                <span>Sekunden anzeigen</span>
                <Switch.Root
                  checked={settings.clockSeconds}
                  onCheckedChange={(checked) => updateSettings({ clockSeconds: checked })}
                  className="relative w-[34px] h-[20px] rounded-full bg-[#E2DFD9] cursor-pointer transition-colors duration-150 data-[checked]:bg-persoenlich flex-none"
                >
                  <Switch.Thumb className="block w-[16px] h-[16px] rounded-full bg-white absolute top-[2px] left-[2px] transition-transform duration-150 data-[checked]:translate-x-[14px]" />
                </Switch.Root>
              </label>

              <ThresholdField
                label="Fällig bald (Tage)"
                value={settings.dueSoonThreshold}
                min={1}
                max={60}
                onChange={(v) => updateSettings({ dueSoonThreshold: v })}
              />
              <ThresholdField
                label="Überfällig (Tage)"
                value={settings.overdueThreshold}
                min={1}
                max={120}
                onChange={(v) => updateSettings({ overdueThreshold: v })}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ThresholdField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <NumberField.Root
        value={value}
        min={min}
        max={max}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <NumberField.Group className="inline-flex items-center border border-card-border rounded-[8px] overflow-hidden">
          <NumberField.Decrement className="px-2 py-0.5 text-muted hover:text-ink cursor-pointer select-none">
            −
          </NumberField.Decrement>
          <NumberField.Input className="w-[36px] text-center tnum text-[13px] text-ink bg-transparent border-x border-card-border py-0.5 outline-none" />
          <NumberField.Increment className="px-2 py-0.5 text-muted hover:text-ink cursor-pointer select-none">
            +
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
    </div>
  );
}
