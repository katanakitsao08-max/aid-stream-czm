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

const TEMPLATE = `full_name,email,staff_number,school,phone,spouse_name,children,parents,next_of_kin,next_of_kin_contact,home_county,signature
Jane Mwende,jane@example.com,TSC12345,Malindi Primary,0712345678,John Mwende,Ann; Brian,Paul & Mary,Peter Mwende,0722000000,Kilifi,Jane Mwende`;

type StagedRow = {
  full_name: string;
  email: string;
  staff_number?: string | null;
  school?: string | null;
  phone?: string | null;
  spouse_name?: string | null;
  children?: string | null;
  parents?: string | null;
  next_of_kin?: string | null;
  next_of_kin_contact?: string | null;
  home_county?: string | null;
  signature?: string | null;
};

const HEADER_ALIASES: Record<keyof StagedRow, string[]> = {
  full_name: ["full_name", "fullname", "name", "full name", "teacher name", "teacher", "teacher's name", "teachers name"],
  email: ["email", "email address", "e-mail", "mail"],
  staff_number: ["staff_number", "staff no", "staff number", "staff", "tsc", "tsc number", "tsc no"],
  school: ["school", "school name", "station"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone", "msisdn", "contact", "contacts"],
  spouse_name: ["spouse_name", "spouse", "name of spouse"],
  children: ["children", "names of children", "name of children"],
  parents: ["parents", "names of biological parents", "biological parents", "name of parents"],
  next_of_kin: ["next_of_kin", "next of kin", "name next of kin", "name of next of kin"],
  next_of_kin_contact: ["next_of_kin_contact", "next of kin contact", "kin contact", "next of kin phone"],
  home_county: ["home_county", "home county", "county"],
  signature: ["signature", "signed"],
};

function normalizeHeader(h: string): keyof StagedRow | null {
  const key = String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  // strip parenthetical hints like "(Input all the your children here)"
  const clean = key.replace(/\(.*?\)/g, "").trim();
  for (const field of Object.keys(HEADER_ALIASES) as (keyof StagedRow)[]) {
    if (HEADER_ALIASES[field].some((a) => a === key || a === clean)) return field;
  }
  for (const field of Object.keys(HEADER_ALIASES) as (keyof StagedRow)[]) {
    if (HEADER_ALIASES[field].some((a) => a.length > 3 && clean.includes(a))) return field;
  }
  return null;
}

function normPhone(v?: string | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return "0" + digits.slice(3);
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return "0" + digits;
  return digits;
}

function rowFromRecord(rec: Record<string, unknown>): StagedRow | null {
  const out: Partial<StagedRow> = {};
  for (const [k, v] of Object.entries(rec)) {
    const field = normalizeHeader(k);
    if (!field) continue;
    const val = String(v ?? "").trim();
    if (!val) continue;
    if (field === "email") out.email = val.toLowerCase();
    else if (field === "phone" || field === "next_of_kin_contact") (out as any)[field] = normPhone(val);
    else (out as any)[field] = val;
  }
  if (!out.full_name) return null;
  if (!out.email) {
    // Synthesize a placeholder email so the row can be staged (Google Forms often omit email)
    const slug = out.full_name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    const tail = (out.phone ?? "noPhone").slice(-4);
    out.email = `${slug}.${tail}@roster.local`;
  }
  return out as StagedRow;
}

function parseCSV(text: string): StagedRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = parts[i] ?? ""));
    return rowFromRecord(rec);
  }).filter((r): r is StagedRow => !!r);
}

function parseExcel(buffer: ArrayBuffer): StagedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json.map(rowFromRecord).filter((r): r is StagedRow => !!r);
}

function rowsToCSV(rows: StagedRow[]): string {
  const cols: (keyof StagedRow)[] = [
    "full_name","email","staff_number","school","phone",
    "spouse_name","children","parents","next_of_kin","next_of_kin_contact","home_county","signature",
  ];
  const header = cols.join(",");
  const body = rows.map((r) =>
    cols.map((c) => String((r as any)[c] ?? "").replace(/,/g, " ")).join(","),
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

    // De-duplicate phones WITHIN the upload (keep first occurrence)
    const seenPhones = new Set<string>();
    const dupedInBatch: string[] = [];
    const deduped = parsed.filter((r) => {
      if (!r.phone) return true;
      if (seenPhones.has(r.phone)) {
        dupedInBatch.push(`${r.full_name} (${r.phone})`);
        return false;
      }
      seenPhones.add(r.phone);
      return true;
    });

    setImporting(true);
    const payload = deduped.map((r) => ({ ...r, created_by: profile?.id ?? null }));
    const { data, error } = await supabase
      .from("staged_teachers")
      .upsert(payload, { onConflict: "email", ignoreDuplicates: false })
      .select("id");
    setImporting(false);

    if (error) {
      // Most common cause: phone clashes with an already-uploaded teacher
      if (/phone/i.test(error.message)) {
        return toast.error("Some phone numbers already exist in the roster. Remove duplicates and try again.");
      }
      return toast.error(error.message);
    }

    const inserted = data?.length ?? deduped.length;
    let msg = `Imported ${inserted} teacher${inserted === 1 ? "" : "s"}`;
    if (dupedInBatch.length) msg += ` — skipped ${dupedInBatch.length} duplicate phone${dupedInBatch.length === 1 ? "" : "s"}`;
    toast.success(msg);
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
