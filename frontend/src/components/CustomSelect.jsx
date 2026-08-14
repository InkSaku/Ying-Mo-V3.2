import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

function textFromNode(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (isValidElement(node)) return textFromNode(node.props.children);
  return "";
}

function collectOptions(children, result = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      collectOptions(child.props.children, result);
      return;
    }
    if (child.type !== "option") return;

    const fallback = textFromNode(child.props.children);
    result.push({
      key: child.key ?? `${child.props.value ?? fallback}-${result.length}`,
      value: String(child.props.value ?? fallback),
      label: child.props.children,
      text: fallback.trim(),
      disabled: Boolean(child.props.disabled),
    });
  });
  return result;
}

function firstEnabled(options) {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabled(options) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

function stepEnabled(options, startIndex, direction) {
  if (!options.length) return -1;
  let index = startIndex;
  for (let count = 0; count < options.length; count += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function CustomSelect({
  children,
  value,
  onChange,
  disabled = false,
  className = "",
  id,
  name,
  ...buttonProps
}) {
  const options = useMemo(() => collectOptions(children), [children]);
  const normalizedValue = value == null ? "" : String(value);
  const selectedIndex = options.findIndex((option) => option.value === normalizedValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const listboxId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const typeaheadRef = useRef({ value: "", timer: null });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : firstEnabled(options)
  );
  const [panelStyle, setPanelStyle] = useState({ visibility: "hidden" });

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const emitChange = useCallback((option) => {
    if (!option || option.disabled) return;
    const syntheticEvent = {
      type: "change",
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
      preventDefault() {},
      stopPropagation() {},
    };
    onChange?.(syntheticEvent);
    close(true);
  }, [close, name, onChange]);

  const openMenu = useCallback((preferredIndex = null) => {
    if (disabled || !options.length) return;
    const nextIndex = preferredIndex ?? (
      selectedIndex >= 0 ? selectedIndex : firstEnabled(options)
    );
    setActiveIndex(nextIndex);
    setPanelStyle({ visibility: "hidden" });
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled(options));
    }
  }, [open, options, selectedIndex]);

  useEffect(() => () => {
    if (typeaheadRef.current.timer) {
      window.clearTimeout(typeaheadRef.current.timer);
    }
  }, []);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(80, Math.min(320, viewportHeight - margin * 2));
    const panelHeight = Math.min(panel.scrollHeight || 180, maxHeight);
    const availableWidth = Math.max(160, viewportWidth - margin * 2);
    const width = Math.min(Math.max(rect.width, 220), availableWidth);
    const left = Math.min(
      Math.max(rect.left, margin),
      Math.max(margin, viewportWidth - width - margin)
    );
    const below = viewportHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const placeAbove = below < Math.min(panelHeight, 180) && above > below;
    const top = placeAbove
      ? Math.max(margin, rect.top - gap - panelHeight)
      : Math.min(rect.bottom + gap, viewportHeight - panelHeight - margin);

    setPanelStyle({
      left,
      top,
      width,
      maxHeight,
      visibility: "visible",
      transformOrigin: placeAbove ? "bottom center" : "top center",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;

    updatePanelPosition();
    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, options.length, updatePanelPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [close, open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const active = panelRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleTypeahead = (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    const nextBuffer = `${typeaheadRef.current.value}${event.key}`.toLocaleLowerCase();
    typeaheadRef.current.value = nextBuffer;
    if (typeaheadRef.current.timer) window.clearTimeout(typeaheadRef.current.timer);
    typeaheadRef.current.timer = window.setTimeout(() => {
      typeaheadRef.current.value = "";
      typeaheadRef.current.timer = null;
    }, 550);

    const start = activeIndex >= 0 ? activeIndex : selectedIndex;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (Math.max(start, -1) + offset) % options.length;
      const option = options[index];
      if (!option.disabled && option.text.toLocaleLowerCase().startsWith(nextBuffer)) {
        if (!open) openMenu(index);
        else setActiveIndex(index);
        return true;
      }
    }
    return false;
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (event.key === "Tab") {
      if (open) close(false);
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close(true);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        const base = selectedIndex >= 0 ? selectedIndex : (direction > 0 ? -1 : 0);
        openMenu(stepEnabled(options, base, direction));
      } else {
        setActiveIndex((current) => stepEnabled(options, current, direction));
      }
      return;
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(firstEnabled(options));
      return;
    }

    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(lastEnabled(options));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
      } else if (activeIndex >= 0) {
        emitChange(options[activeIndex]);
      }
      return;
    }

    if (handleTypeahead(event)) {
      event.preventDefault();
    }
  };

  const panel = open && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={panelRef}
        id={listboxId}
        className="custom-select-panel"
        role="listbox"
        aria-label={buttonProps["aria-label"] || "可选项"}
        style={panelStyle}
      >
        {options.map((option, index) => {
          const selected = option.value === normalizedValue;
          const active = index === activeIndex;
          return (
            <div
              id={`${listboxId}-option-${index}`}
              key={option.key}
              data-option-index={index}
              className={`custom-select-option${selected ? " selected" : ""}${active ? " active" : ""}${option.disabled ? " disabled" : ""}`}
              role="option"
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              onMouseEnter={() => {
                if (!option.disabled) setActiveIndex(index);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => emitChange(option)}
            >
              <span className="custom-select-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              <span className="custom-select-option-label">{option.label}</span>
            </div>
          );
        })}
      </div>,
      document.body
    )
    : null;

  return (
    <div
      className={`custom-select${className ? ` ${className}` : ""}`}
      data-open={open || undefined}
      data-disabled={disabled || undefined}
    >
      {name ? <input type="hidden" name={name} value={normalizedValue} /> : null}
      <button
        {...buttonProps}
        ref={triggerRef}
        id={id}
        className="custom-select-trigger"
        type="button"
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => {
          if (open) close(false);
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={`custom-select-value${selectedOption ? "" : " placeholder"}`}>
          {selectedOption?.label ?? "请选择"}
        </span>
        <svg className="custom-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {panel}
    </div>
  );
}
