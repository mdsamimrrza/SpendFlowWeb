"use client";

import { useState } from "react";
import { Delete, Equal } from "lucide-react";

/**
 * Optional calculator pad for the amount hero (web-only, spec §2). Single
 * binary-operation folding like a basic desk calculator: `90 + 50 =` → 140.
 * Digits while an operator is pending build the right-hand side; pressing the
 * next operator folds the running result first.
 */
type Op = "+" | "-" | "×" | "÷";

function apply(a: number, op: Op, b: number): number {
  const r = op === "+" ? a + b : op === "-" ? a - b : op === "×" ? a * b : a / b;
  return Math.round(r * 100) / 100;
}

export function AmountKeypad({
  amount,
  onChange,
}: {
  amount: string;
  onChange: (value: string) => void;
}) {
  const [lhs, setLhs] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [rhs, setRhs] = useState("");

  const digit = (d: string) => {
    if (op) setRhs((r) => (r === "0" ? d : r.length < 12 ? r + d : r));
    else onChange(amount.length < 14 ? (amount === "0" ? d : amount + d) : amount);
  };
  const dot = () => {
    if (op) {
      if (!rhs.includes(".")) setRhs((r) => (r === "" ? "0." : r + "."));
    } else if (!amount.includes(".")) onChange((amount || "0") + ".");
  };
  const chooseOp = (next: Op) => {
    if (op && lhs != null && rhs !== "") {
      // Fold the running result before accepting the next operator.
      const folded = apply(lhs, op, Number(rhs));
      setLhs(folded);
      onChange(String(folded));
    } else if (lhs == null) {
      setLhs(Number(amount) || 0);
    }
    setOp(next);
    setRhs("");
  };
  const equals = () => {
    if (op && lhs != null) {
      const result = apply(lhs, op, Number(rhs));
      onChange(String(result));
    }
    setLhs(null);
    setOp(null);
    setRhs("");
  };
  const clear = () => {
    setLhs(null);
    setOp(null);
    setRhs("");
    onChange("");
  };
  const back = () => {
    if (op) setRhs((r) => r.slice(0, -1));
    else onChange(amount.slice(0, -1));
  };

  const expression = op && lhs != null ? `${lhs} ${op} ${rhs}` : "";

  return (
    <div className="mt-3 border border-border bg-surface-elevated p-2" aria-label="Calculator pad">
      <p className="stamp mb-1 h-4 text-right" aria-live="polite">
        {expression || "\u00A0"}
      </p>
      <div className="grid grid-cols-4 gap-1">
        {[
          ["C", "fn"], ["⌫", "fn"], [".", ""], ["÷", "op"],
          ["7", ""], ["8", ""], ["9", ""], ["×", "op"],
          ["4", ""], ["5", ""], ["6", ""], ["−", "op"],
          ["1", ""], ["2", ""], ["3", ""], ["+", "op"],
          ["=", "eq"], ["", "zero"], ["", "zero"], ["", "zero"],
        ].map(([label, kind], i) => {
          const key = `${label || "zero"}-${i}`;
          if (label === "⌫")
            return (
              <PadButton key={key} onClick={back} kind="fn" ariaLabel="Backspace">
                <Delete size={14} />
              </PadButton>
            );
          if (label === "=")
            return (
              <PadButton key={key} onClick={equals} kind="eq" ariaLabel="Equals">
                <Equal size={14} />
              </PadButton>
            );
          if (!label) {
            // last row: "0" spans the remaining three cells
            return i === 17 ? (
              <PadButton key={key} onClick={() => digit("0")} kind="" wide>
                0
              </PadButton>
            ) : null;
          }
          const cls = kind as "" | "fn" | "op" | "eq";
          return (
            <PadButton
              key={key}
              kind={cls}
              onClick={() => {
                if (label === "C") clear();
                else if (label === ".") dot();
                else if (label === "+") chooseOp("+");
                else if (label === "−") chooseOp("-");
                else if (label === "×") chooseOp("×");
                else if (label === "÷") chooseOp("÷");
                else digit(label);
              }}
            >
              {label}
            </PadButton>
          );
        })}
      </div>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  kind = "",
  wide = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: "" | "fn" | "op" | "eq";
  wide?: boolean;
  ariaLabel?: string;
}) {
  const tone =
    kind === "op"
      ? "text-primary"
      : kind === "eq"
        ? "bg-primary text-white hover:opacity-90"
        : kind === "fn"
          ? "text-text-muted"
          : "text-text";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex h-10 items-center justify-center border border-border bg-surface text-sm font-bold transition active:scale-[0.96] hover:border-text-muted ${tone} ${
        wide ? "col-span-3" : ""
      }`}
    >
      {children}
    </button>
  );
}
