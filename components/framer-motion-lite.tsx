"use client";

import type * as React from "react";

type MotionProps = React.HTMLAttributes<HTMLDivElement> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
  layout?: unknown;
};

function MotionDiv({
  initial: _initial,
  animate: _animate,
  exit: _exit,
  transition: _transition,
  layout: _layout,
  ...props
}: MotionProps) {
  return <div {...props} />;
}

export const motion = {
  div: MotionDiv,
};

export function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
