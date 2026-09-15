"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/layout/StatusPage";
import { useLanguage } from "@/store/LanguageContext";

/** Route-level runtime error boundary (all segments without their own). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  useEffect(() => {
    // Raw error goes to the console only — never rendered to the user
    // (digest is enough for support; mirrors the P3-9 no-leak rule).
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      tone="danger"
      icon={<TriangleAlert size={26} aria-hidden />}
      title={t("errorTitle")}
      body={t("errorBody")}
      actions={
        <>
          <Button className="min-h-[44px]" onClick={reset}>
            {t("tryAgain")}
          </Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={() => router.push("/")}>
            {t("backHome")}
          </Button>
        </>
      }
    />
  );
}
