import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { Label } from "@repo/ui/components/ui/label";
import { cn } from "@repo/ui/lib/utils";
import { propsPlugin } from "./codemirror-utils";

function ensureStringValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export default function CodeMirrorFieldNumber({
  type,
  name,
  label,
  description,
  className,
  value,
  isVisible,
  error,
  submited,
  onFocus,
  disabled,
  onChange,
  onSelect,
  onClick,
  onKeyUp,
  required,
}: any) {
  const [editorValue, setEditorValue] = React.useState(
    ensureStringValue(value),
  );

  const editorRef = React.useRef<any>(null);

  const handleChange = React.useCallback(
    (val: string) => {
      setEditorValue(val);

      onChange(name, val, true);
    },
    [name, onChange],
  );

  const handleCursorActivity = React.useCallback(
    (viewUpdate: any) => {
      if (viewUpdate.view) {
        const pos = viewUpdate.view.state.selection.main.head;
        if (onSelect) {
          onSelect({ target: { selectionStart: pos, selectionEnd: pos } });
        }
      }
    },
    [onSelect],
  );

  React.useEffect(() => {
    if (value !== editorValue) {
      setEditorValue(ensureStringValue(value));
    }
  }, [value]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="grid gap-3 my-2 w-full">
      {/* <Label htmlFor={name}>{label} */}
      <Label htmlFor={name}>
        {label}{" "}
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
          number
        </span>
      </Label>
      {/* </Label> */}
      <div className="relative w-full overflow-hidden [&_.cm-editor.cm-focused]:outline-none">
        <CodeMirror
          ref={editorRef}
          value={editorValue}
          onChange={handleChange}
          onFocus={onFocus}
          onClick={onClick}
          onKeyUp={onKeyUp}
          onUpdate={handleCursorActivity}
          readOnly={disabled}
          extensions={[propsPlugin]}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
          }}
          style={{
            minHeight: "2.5rem",
            height: "auto",
            width: "100%",
            maxWidth: "100%",
            overflow: "auto",
            wordWrap: "break-word",
            overflowWrap: "break-word",
            whiteSpace: "pre-wrap",
            boxSizing: "border-box",
            fontFamily: "monospace",
            outline: "none",
          }}
          className={cn(
            "w-full overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
      </div>
      {error && submited && <div className="text-red-500">{error}</div>}
    </div>
  );
}
