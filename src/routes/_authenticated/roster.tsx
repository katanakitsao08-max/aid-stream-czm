import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";


export const Route = createFileRoute("/_authenticated/roster")({
  head: () => ({ meta: [{ title: "Teacher Roster — CZMT Welfare" }] }),
  component: RosterPage,
});

const TEMPLATE = `full_name,email,staff_number,school,phone
Jane Mwende,jane@example.com,TSC12345,Malindi Primary,0712345678
John Karisa,john@example.com,TSC67890,Ganda Primary,0798765432`;

type StagedRow = {
  full_name: string;
  email: string;
  staff_number?: string | null;
  school?: string | null;
  phone?: string | null;
};

function parseCSV(text: string): StagedRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const i = {
    name: idx("full_name"),
    email: idx("email"),
    staff: idx("staff_number"),
    school: idx("school"),
    phone: idx("phone"),
  };
  if (i.name < 0 || i.email < 0) {
    throw new Error("CSV must include 'full_name' and 'email' columns");
  }
  return lines.slice(1).map((line) => {
    // simple split — assume no commas in fields. Good enough for school admin use.
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    return {
      full_name: parts[i.name] ?? "",
      email: (parts[i.email] ?? "").toLowerCase(),
      staff_number: i.staff >= 0 ? parts[i.staff] || null : null,
      school: i.school >= 0 ? parts[i.school] || null : null,
      phone: i.phone >= 0 ? parts[i.phone] || null : null,
    };
  }).filter((r) => r.full_name && r.email);
}

const HEADER_ALIASES: Record<keyof StagedRow, string[]> = {
  full_name: ["full_name", "fullname", "name", "full name", "teacher name", "teacher"],
  email: ["email", "email address", "e-mail", "mail"],
  staff_number: ["staff_number", "staff no", "staff number", "staff", "tsc", "tsc number", "tsc no"],
  school: ["school", "school name", "station"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone", "msisdn"],
};

function normalizeHeader(h: string): keyof StagedRow | null {
  const key = String(h ?? "").trim().toLowerCase();
  for (const field of Object.keys(HEADER_ALIASES) as (keyof StagedRow)[]) {
    if (HEADER_ALIASES[field].includes(key)) return field;
  }
  return null;
}

function parseExcel(buffer: ArrayBuffer): StagedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json
    .map((row) => {
      const out: Partial<StagedRow> = {};
      for (const [k, v] of Object.entries(row)) {
        const field = normalizeHeader(k);
        if (!field) continue;
        const val = String(v ?? "").trim();
        if (field === "email") out.email = val.toLowerCase();
        else (out as any)[field] = val || null;
      }
      return out;
    })
    .filter((r): r is StagedRow => !!r.full_name && !!r.email);
}

function rowsToCSV(rows: StagedRow[]): string {
  const header = "full_name,email,staff_number,school,phone";
  const body = rows.map((r) =>
    [r.full_name, r.email, r.staff_number ?? "", r.school ?? "", r.phone ?? ""]
      .map((v) => String(v).replace(/,/g, " "))
      .join(","),
  );
  return [header, ...body].join("\n");
}


function RosterPage() {
  const { isAdmin, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, isLoading, navigate]);

  const { data: rows = [] } = useQuery({
    queryKey: ["staged-teachers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_teachers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleFile = (f: File) => {
    const name = f.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm");
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = parseExcel(reader.result as ArrayBuffer);
          if (!rows.length) {
            toast.error("No valid rows found. Check column headers (need name & email).");
            return;
          }
          setCsv(rowsToCSV(rows));
          toast.success(`Loaded ${rows.length} row${rows.length === 1 ? "" : "s"} from Excel — review then click Import`);
        } catch (e: any) {
          toast.error(`Could not read Excel file: ${e.message ?? e}`);
        }
      };
      reader.readAsArrayBuffer(f);
    } else {
      const reader = new FileReader();
      reader.onload = () => setCsv(String(reader.result ?? ""));
      reader.readAsText(f);
    }
  };

  const handleImport = async () => {
    let parsed: StagedRow[];
    try {
      parsed = parseCSV(csv);
    } catch (e: any) {
      return toast.error(e.message);
    }
    if (!parsed.length) return toast.error("No valid rows found");
    setImporting(true);
    const payload = parsed.map((r) => ({ ...r, created_by: profile?.id ?? null }));
    const { error } = await supabase
      .from("staged_teachers")
      .upsert(payload, { onConflict: "email", ignoreDuplicates: false });
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${parsed.length} teacher${parsed.length === 1 ? "" : "s"}`);
    setCsv("");
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["staged-teachers"] });
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileSpreadsheet className="h-6 w-6 text-primary" /> Teacher Roster
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload teacher details ahead of time. When a teacher signs up with a matching email,
          they'll be prompted to confirm and attach the record to their profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from Excel or CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose Excel / CSV file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCsv(TEMPLATE)}
            >
              Load template
            </Button>
            <span className="text-xs text-muted-foreground">
              Required columns: <code>full_name</code> (or Name), <code>email</code>. Optional: <code>staff_number</code> (TSC), <code>school</code>, <code>phone</code>.
            </span>
          </div>

          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="Paste CSV here or choose a file…"
            className="min-h-40 font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={importing || !csv.trim()}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uploaded teachers ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Staff No.</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>{r.staff_number ?? "—"}</TableCell>
                    <TableCell>{r.school ?? "—"}</TableCell>
                    <TableCell>{r.phone ?? "—"}</TableCell>
                    <TableCell>
                      {r.claimed_by ? (
                        <Badge variant="default">Claimed</Badge>
                      ) : (
                        <Badge variant="secondary">Waiting</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (!confirm(`Remove ${r.full_name}?`)) return;
                          const { error } = await supabase
                            .from("staged_teachers")
                            .delete()
                            .eq("id", r.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success("Removed");
                            qc.invalidateQueries({ queryKey: ["staged-teachers"] });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No teachers uploaded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
