"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { SCREENS } from "../registry";

/**
 * Single design-preview route: /preview/<screen> renders the mock-data-only
 * version of that screen (see app/preview/registry.ts). Public by middleware,
 * never linked from app navigation — the screenshot/overflow tooling and
 * design review use these pages.
 */
export default function PreviewScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = use(params);
  // Own-property lookup only: inherited keys like 'constructor' must resolve
  // to notFound(), not to a truthy non-component.
  const Screen = Object.hasOwn(SCREENS, screen) ? SCREENS[screen] : undefined;
  if (!Screen) notFound();
  return <Screen />;
}
