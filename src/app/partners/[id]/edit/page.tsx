"use client";

import { useParams } from "next/navigation";
import { PartnerForm } from "@/components/partner-form";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, useData } from "@/lib/data";

export default function EditPartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useData(() => api.partner(id), [id]);
  if (error) return <ErrorBox error={error} />;
  if (loading) return <Loading />;
  if (!data) return <Empty title="Partner not found" />;
  return (
    <>
      <PageHeader title={`Edit ${data.name}`} />
      <PartnerForm partner={data} />
    </>
  );
}
