import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, ShieldAlert, FileSearch, ArrowRight, RotateCw, Database, Ban, ServerCrash, ChevronDown } from "lucide-react";
import SmartRetryDialog from "@/components/diagnostics/SmartRetryDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Diagnostics() {
  const { data: patterns, refetch, isFetching } = useQuery({
    queryKey: ["analyzeFailures"],
    queryFn: async () => {
      const res = await base44.functions.invoke("analyzeFailures", {});
      return res.data?.patterns || [];
    }
  });

  const handleExport = async (format) => {
    const loadingToast = toast.loading(`Compiling system logs for ${format.toUpperCase()} export...`);
    try {
      const res = await base44.functions.invoke("exportLogs", { format });
      const blob = new Blob([res.data.data], { type: res.data.type });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system_logs_export_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Logs exported successfully as ${format.toUpperCase()}.`, { id: loadingToast });
    } catch (e) {
      toast.error("Export failed: " + e.message, { id: loadingToast });
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'CAPTCHA/Anti-Bot': return <ShieldAlert className="h-4 w-4 text-destructive" />;
      case 'Structural Changes': return <FileSearch className="h-4 w-4 text-warning" />;
      case 'Proxy Failures': return <ServerCrash className="h-4 w-4 text-destructive" />;
      case 'Account Disabled': return <Ban className="h-4 w-4 text-muted-foreground" />;
      case 'Invalid Credentials': return <Database className="h-4 w-4 text-info" />;
      default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="05 · analysis & recovery"
        title="Diagnostics & Log Export"
        description="Comprehensive error logging, automatic failure pattern detection, and full system log export."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
              <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh Analysis
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Download className="h-4 w-4" /> Export Complete Logs <ChevronDown className="h-3 w-3 opacity-50"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>Export as JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="mt-8 space-y-6">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Detected Failure Patterns</h2>
        </div>

        {!patterns ? (
          <div className="rounded-xl border border-border bg-card p-8 flex items-center justify-center">
            <RotateCw className="h-5 w-5 text-primary animate-spin mr-3" />
            <span className="text-sm text-muted-foreground">Parsing historical failed runs...</span>
          </div>
        ) : patterns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 py-12 text-center text-sm text-muted-foreground">
            No significant failure patterns detected in recent runs. The system appears stable.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {patterns.map((pattern, i) => (
              <Card key={i} className="bg-card hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base flex items-center gap-2">
                      {getIcon(pattern.type)}
                      {pattern.type}
                    </CardTitle>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      {pattern.count} events
                    </span>
                  </div>
                  <CardDescription className="uppercase tracking-wider font-mono text-[10px] mt-1 text-primary">
                    Target Site: {pattern.site}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 bg-background/50 p-3 rounded border border-border/50">
                    {pattern.suggestion}
                  </p>
                  <div className="flex gap-2">
                    <SmartRetryDialog pattern={pattern} />
                    {pattern.type === 'Structural Changes' && (
                      <Button variant="secondary" size="sm" className="w-full text-xs" asChild>
                        <Link to="/settings"><ArrowRight className="h-3 w-3 mr-1"/> Open Sandbox</Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                       <Link to="/runs"><ArrowRight className="h-3 w-3 mr-1"/> View Runs</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}