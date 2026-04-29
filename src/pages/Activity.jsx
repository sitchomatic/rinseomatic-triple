import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ActivityPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => base44.entities.AuditLog.list("-created_date", 100),
    refetchInterval: 5000
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Activity Dashboard" description="Track every Cloud Function execution and run." />
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Function</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Execution Time</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No activity found.</TableCell></TableRow>
            ) : logs.map(log => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">{format(new Date(log.created_date), "MMM d, HH:mm:ss")}</TableCell>
                <TableCell className="font-mono text-xs">{log.function_name}</TableCell>
                <TableCell>
                  <Badge variant={log.status === 'success' ? 'default' : log.status === 'error' ? 'destructive' : 'secondary'}>
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell>{log.execution_ms ? `${log.execution_ms}ms` : '-'}</TableCell>
                <TableCell className="font-mono text-[10px] max-w-xs truncate" title={log.metadata}>
                  {log.metadata}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}