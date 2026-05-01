import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonitorPlay, Camera, Cloud, Wifi, ExternalLink, RefreshCw, Clock, Video, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function Monitor() {
  const testMut = useMutation({
    mutationFn: async (provider) => {
      const res = await base44.functions.invoke("providerMonitor", { provider });
      return { provider, data: res.data };
    },
    onSuccess: ({ provider, data }) => {
      if (data.ok) {
        if (provider === "scrapingbee" && data.data) {
          toast.success(`${provider} connection successful! Used: ${data.data.used_api_credit}/${data.data.max_api_credit} credits.`);
        } else {
          toast.success(`${provider} connection successful!`);
        }
      } else {
        toast.error(`${provider} connection failed: ${data.error}`);
      }
    },
    onError: (e) => toast.error(e.message)
  });

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["providerMonitor"],
    queryFn: async () => {
      const res = await base44.functions.invoke("providerMonitor", {});
      return res.data;
    },
    refetchInterval: 10000,
  });

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="04 · live operations"
        title="Live Monitor & Media"
        description="Live look-in, session recordings, and screenshot vaults utilizing the native REST APIs of your active browser automation providers."
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh API Data
          </Button>
        }
      />

      <div className="space-y-10">
        
        {/* BROWSERLESS NATIVE SECTION */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">Browserless.io Live View</h2>
              <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Active WebSockets & CDP Inspectors</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => testMut.mutate('browserless')} disabled={testMut.isPending}>
              <Activity className="h-3 w-3" /> Connection Test
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {!data?.browserless?.sessions?.length ? (
               <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
                 No active Browserless workers found right now.
               </div>
            ) : (
              data.browserless.sessions.map((session, i) => (
                <Card key={session.id || i} className="bg-card hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-mono truncate">{session.id || session.pageId || `Session ${i+1}`}</CardTitle>
                    <CardDescription className="text-xs truncate" title={session.pageUrl}>{session.pageUrl || 'Navigating...'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <Button variant="secondary" size="sm" className="w-full gap-2 text-xs hover:bg-primary hover:text-primary-foreground transition-all" asChild>
                      <a href={`https://${data.browserless.host}/devtools/inspector.html?wss=${data.browserless.host}/devtools/page/${session.pageId || session.id}&token=${data.browserless.token}`} target="_blank" rel="noreferrer">
                        <MonitorPlay className="h-3.5 w-3.5" /> Open DevTools Inspector
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* BROWSERBASE NATIVE SECTION */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">Browserbase Recordings</h2>
              <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Native Session APIs & Videos</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => testMut.mutate('browserbase')} disabled={testMut.isPending}>
              <Activity className="h-3 w-3" /> Connection Test
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {!data?.browserbase?.length ? (
               <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
                 No recent Browserbase sessions found. Configure your project keys to view.
               </div>
            ) : (
              data.browserbase.slice(0, 6).map(session => (
                <Card key={session.id} className="bg-card">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-sm font-mono truncate mr-2">{session.id}</CardTitle>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0 ${session.status === 'RUNNING' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-secondary text-muted-foreground border border-border'}`}>
                        {session.status}
                      </span>
                    </div>
                    <CardDescription className="text-xs">
                      {formatDistanceToNow(new Date(session.createdAt || session.created_at || Date.now()), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="secondary" size="sm" className="w-full gap-2 text-xs" asChild>
                      <a href={`https://www.browserbase.com/sessions/${session.id}`} target="_blank" rel="noreferrer">
                        {session.status === 'RUNNING' ? <MonitorPlay className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />} 
                        {session.status === 'RUNNING' ? 'Live Session View' : 'Watch Recording'}
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* SCRAPINGBEE & GLOBAL SCREENSHOTS SECTION */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">ScrapingBee & Universal Media</h2>
              <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Captured Screenshots Vault</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => testMut.mutate('scrapingbee')} disabled={testMut.isPending}>
              <Activity className="h-3 w-3" /> Connection Test
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!data?.screenshots?.length ? (
               <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 py-12 text-center text-sm text-muted-foreground">
                 No screenshots captured yet. Enable "Capture screenshots" in your Provider settings to populate this vault.
               </div>
            ) : (
              data.screenshots.map(ss => (
                <Card key={ss.id} className="overflow-hidden bg-card flex flex-col hover:border-primary/30 transition-colors">
                  <div className="aspect-[4/3] relative bg-black/60 border-b border-border/50 flex items-center justify-center">
                    <img src={ss.image_url} alt="Screenshot" className="absolute inset-0 w-full h-full object-contain hover:scale-105 transition-transform duration-500" />
                  </div>
                  <CardContent className="p-3.5 flex-1 flex flex-col justify-between bg-card/40">
                    <div>
                      <div className="font-mono text-xs text-primary mb-1 uppercase tracking-wider">{ss.site}</div>
                      <div className="text-[11px] text-muted-foreground font-medium">{ss.step_label}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(ss.captured_at), { addSuffix: true })}
                      </div>
                      <a href={ss.image_url} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors p-1" title="View full resolution">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}