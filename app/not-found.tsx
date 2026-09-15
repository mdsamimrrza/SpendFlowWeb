"use client";

import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/layout/StatusPage";
import { useLanguage } from "@/store/LanguageContext";

/** Custom 404: unmatched routes + render-time notFound() across all groups. */
export default function NotFound() {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <StatusPage
      tone="brand"
      figure="404"
      icon={<Compass size={26} aria-hidden />}
      title={t("notFoundTitle")}
      body={t("notFoundBody")}
      actions={
        <>
          <Button className="min-h-[44px]" onClick={() => router.push("/")}>
            {t("backHome")}
          </Button>
          <Button variant="secondary" className="min-h-[44px]" onClick={() => router.back()}>
            {t("goBack")}
          </Button>
        </>
      }
    />
  );
}
