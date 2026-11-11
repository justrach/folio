"use client";

import { Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "@/components/icons";
import "./select.css";

type Choice = { value: string; label: string; disabled: boolean; group?: string };
type Change = { target: { value: string }; currentTarget: { value: string } };
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number; defaultValue?: string | number; required?: boolean; onReselect?: (value: string) => void; onChange?: (event: Change) => void;
};

function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function choices(children: ReactNode, group?: string, groupDisabled = false): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return choices(child.props.children, group, groupDisabled);
    if (child.type === "optgroup") return choices(child.props.children, child.props.label, Boolean(child.props.disabled));
    if (child.type !== "option") return [];
    const label = child.props.label ?? text(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: groupDisabled || Boolean(child.props.disabled), group }];
  });
}

/** Shared visible dropdown; existing option data and value-only change handlers are preserved. */
export const UiSelect = forwardRef<HTMLButtonElement, Props>(function UiSelect({ children, value, defaultValue, onChange, onReselect, disabled, name, form, required, id, className, style, ...attributes }, ref) {
  const generatedId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [ready, setReady] = useState(false);
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);
  const attachRef = useCallback((node: HTMLButtonElement | null) => {
    trigger.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  useEffect(() => {
    setContainer(trigger.current?.closest<HTMLElement>(".landing, .ob, .folio-workspace, .api-docs") ?? undefined);
    setReady(true);
  }, []);
  const options = choices(children);
  const [local, setLocal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const current = value === undefined ? local : String(value);
  const selected = options.find(option => option.value === current);
  // Radix reserves the empty string for its placeholder. Encode values only inside the widget.
  const encode = (raw: string) => `value:${raw}`;
  const groups = [...new Set(options.map(option => option.group))];
  return <Select.Root value={encode(current)} disabled={disabled || !ready} required={required} onValueChange={encoded => {
    const next = encoded.slice(6);
    setLocal(next);
    onChange?.({ target: { value: next }, currentTarget: { value: next } });
  }}>
    <Select.Trigger {...attributes} id={id ?? generatedId} ref={attachRef} style={style} className={`folio-select-trigger${className ? ` ${className}` : ""}`} data-value={current}>
      <Select.Value><span className="folio-select-value">{selected?.label ?? "Choose an option"}</span></Select.Value>
      <Select.Icon className="folio-select-icon"><ChevronDown size={16} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    {name && <input type="hidden" name={name} value={current} disabled={disabled} form={form} />}
    <Select.Portal container={container}><Select.Content className="folio-select-menu" position="popper" sideOffset={6} collisionPadding={12}>
      <Select.Viewport className="folio-select-viewport">
        {groups.map((group, index) => <Select.Group key={group ?? `ungrouped-${index}`}>
          {group && <Select.Label className="folio-select-group">{group}</Select.Label>}
          {options.filter(option => option.group === group).map(option => <Select.Item key={option.value} value={encode(option.value)} textValue={option.label} disabled={option.disabled} className="folio-select-option" data-value={option.value}
            onPointerUp={() => { if (!option.disabled && option.value === current) onReselect?.(option.value); }}
            onKeyDown={event => { if (!option.disabled && option.value === current && ["Enter", " "].includes(event.key)) onReselect?.(option.value); }}>
            <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className="folio-select-check"><Check size={15} aria-hidden="true" /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Group>)}
      </Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>;
});
