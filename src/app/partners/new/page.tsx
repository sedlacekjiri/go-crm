"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PartnerForm } from "@/components/partner-form";
import { Loading, PageHeader } from "@/components/ui";
import { PARTNER_TYPES, type PartnerType } from "@/lib/types";

function NewPartner() {
  const params = useSearchParams();
  const t = params.get("type");
  const type = PARTNER_TYPES.some((x) => x.value === t) ? (t as PartnerType) : "hotel";
  return (
    <>
      <PageHeader title="New partner" />
      <PartnerForm defaultType={type} />
    </>
  );
}

export default function NewPartnerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewPartner />
    </Suspense>
  );
}
