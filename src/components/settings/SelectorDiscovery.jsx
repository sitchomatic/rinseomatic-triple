import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Copy, Zap, Crosshair, Code2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SelectorDiscovery({ open, onOpenChange, onSelectorFound }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [selector, setSelector] = useState("");
  const iframeRef = React.useRef(null);

  const handleLoadSite = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setLoading(true);
    try {
      // Inject inspector script into iframe
      const iframe = iframeRef.current;
      if (iframe) {
        iframe.src = url;
        iframe.onload = () => {
          try {
            // Inject click handler into iframe
            const doc = iframe.contentDocument;
            if (doc) {
              const script = doc.createElement("script");
              script.textContent = `
                window.selectedElement = null;
                document.addEventListener("click", (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  
                  const el = e.target;
                  window.selectedElement = el;
                  
                  // Highlight element
                  document.querySelectorAll(".__selector-highlight").forEach(x => x.classList.remove("__selector-highlight"));
                  el.classList.add("__selector-highlight");
                  el.style.outline = "3px solid #00d4ff";
                  el.style.outlineOffset = "2px";
                  
                  // Generate selector
                  let selector = "";
                  if (el.id) selector = "#" + el.id;
                  else if (el.className) selector = "." + el.className.split(" ")[0];
                  else selector = el.tagName.toLowerCase();
                  
                  // Store selector
                  window.lastSelector = selector;
                  parent.postMessage({ type: "selector", selector, tagName: el.tagName, text: el.textContent.slice(0, 50) }, "*");
                }, true);
                
                const style = document.createElement("style");
                style.textContent = ".__selector-highlight { outline: 3px solid #00d4ff !important; outline-offset: 2px !important; }";
                document.head.appendChild(style);
              `;
              doc.head.appendChild(script);
            }
          } catch (e) {
            console.error("Inspector injection failed:", e);
          }
          setIframeReady(true);
          setLoading(false);
        };
      }
    } catch (e) {
      toast.error("Failed to load site: " + e.message);
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === "selector") {
        setSelectedElement({
          selector: e.data.selector,
          tagName: e.data.tagName,
          text: e.data.text,
        });
        setSelector(e.data.selector);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const copySelector = () => {
    navigator.clipboard.writeText(selector);
    toast.success("Selector copied!");
  };

  const handleConfirm = () => {
    if (!selector.trim()) {
      toast.error("Please select an element first");
      return;
    }
    onSelectorFound(selector);
    onOpenChange(false);
    setUrl("");
    setSelector("");
    setSelectedElement(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            Selector Discovery Tool
          </DialogTitle>
          <DialogDescription>
            Load a site and click on elements to generate CSS selectors automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-auto">
          {/* URL Input */}
          <div className="space-y-2">
            <Label className="text-xs">Site URL</Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/login"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadSite()}
              />
              <Button
                onClick={handleLoadSite}
                disabled={loading || !url.trim()}
                className="gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                {loading ? "Loading…" : "Load"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Note: You may see CORS warnings. Click elements directly on the page to generate selectors.
            </p>
          </div>

          {/* Instructions */}
          {iframeReady && !selectedElement && (
            <div className="rounded-md border border-border/50 bg-background/50 p-3">
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Crosshair className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium text-foreground mb-0.5">Inspector ready</div>
                  Click on any element in the preview to generate its CSS selector.
                </div>
              </div>
            </div>
          )}

          {/* Iframe Preview */}
          {iframeReady && (
            <div className="border border-border rounded-md overflow-hidden bg-background">
              <iframe
                ref={iframeRef}
                className="w-full h-[300px]"
                title="Site Preview"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          )}

          {/* Selected Element Display */}
          {selectedElement && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Selected element</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    <div>&lt;{selectedElement.tagName.toLowerCase()}&gt; {selectedElement.text}</div>
                  </div>
                </div>
                <Code2 className="h-4 w-4 text-emerald-300" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Generated Selector</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                    title="Edit to refine the selector"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copySelector}
                    className="gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  You can edit the selector above to refine it further (e.g., add parent selectors, use attribute selectors).
                </p>
              </div>
            </div>
          )}

          {/* Warnings */}
          {iframeReady && (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                CORS: Cross-origin sites may block inspection. Try inspecting the same-origin login form, or manually refine the selector.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selector.trim()}
            title={selector.trim() ? "Use this selector" : "Select an element first"}
          >
            Use selector
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}