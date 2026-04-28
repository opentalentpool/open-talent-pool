import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MODERATION_REPORT_CATEGORY_LABEL,
  MODERATION_REPORT_CATEGORY_VALUES,
  REPORTING_STRIKE_THRESHOLD,
} from "@/lib/moderation.js";
import type { ModerationReportCategory, ReportSubmissionStatus } from "@/types/moderation";

function formatRestrictionDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export const ReportDialog = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Enviar denúncia",
  status,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel?: string;
  status: ReportSubmissionStatus | null;
  submitting: boolean;
  onSubmit: (payload: { category: ModerationReportCategory; description: string }) => Promise<void>;
}) => {
  const [category, setCategory] = useState<ModerationReportCategory | "placeholder">("placeholder");
  const [reportDescription, setReportDescription] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) {
      setCategory("placeholder");
      setReportDescription("");
      setFormError("");
    }
  }, [open]);

  const restrictionDate = formatRestrictionDate(status?.reportingRestrictedUntil || null);
  const canSubmit = status?.canSubmit ?? true;

  const handleSubmit = async () => {
    if (category === "placeholder") {
      setFormError("Selecione a categoria da denúncia.");
      return;
    }

    if (reportDescription.trim().length < 5) {
      setFormError("Descreva o motivo da denúncia com um pouco mais de contexto.");
      return;
    }

    setFormError("");
    await onSubmit({
      category,
      description: reportDescription.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!canSubmit ? (
          <div className="rounded-[1.3rem] border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-destructive">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>
                  Seu acesso ao canal de denúncias está temporariamente restrito
                  {restrictionDate ? ` até ${restrictionDate}` : ""}.
                </p>
                {status?.reportingRestrictionReason ? (
                  <p className="mt-2 text-destructive/80">{status.reportingRestrictionReason}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {status?.falseReportStrikeCount ? (
          <div className="rounded-[1.3rem] border border-border/80 bg-secondary/50 p-4 text-sm leading-6 text-muted-foreground">
            {status.falseReportStrikeCount} de {REPORTING_STRIKE_THRESHOLD} registros improcedentes confirmados nesta janela.
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <Label htmlFor="report-category">Categoria da denúncia</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ModerationReportCategory | "placeholder")}
              disabled={!canSubmit || submitting}
            >
              <SelectTrigger
                id="report-category"
                aria-label="Categoria da denúncia"
                className="mt-2 h-11 rounded-2xl border-border/80 bg-white/90"
              >
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder">Selecione a categoria</SelectItem>
                {MODERATION_REPORT_CATEGORY_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MODERATION_REPORT_CATEGORY_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="report-description">Relato da denúncia</Label>
            <Textarea
              id="report-description"
              rows={5}
              className="mt-2 rounded-[1.6rem] border-border/80 bg-white/90"
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              disabled={!canSubmit || submitting}
            />
          </div>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="rounded-full" disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
