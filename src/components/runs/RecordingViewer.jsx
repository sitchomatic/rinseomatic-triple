import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RecordingViewer({ testResult, open, onOpenChange }) {
  const [activeTab, setActiveTab] = React.useState("recording");
  const [currentScreenshot, setCurrentScreenshot] = React.useState(0);

  const hasRecording = !!testResult?.recording_url;
  const hasScreenshots = Array.isArray(testResult?.screenshots) && testResult.screenshots.length > 0;

  if (!hasRecording && !hasScreenshots) {
    return null;
  }

  const screenshots = testResult?.screenshots || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Recording · {testResult?.username}@{testResult?.site_key}
          </DialogTitle>
        </DialogHeader>

        {(hasRecording || hasScreenshots) && (
          <div className="flex gap-2 border-b border-border mb-4">
            {hasRecording && (
              <Button
                variant={activeTab === "recording" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("recording")}
              >
                Video
              </Button>
            )}
            {hasScreenshots && (
              <Button
                variant={activeTab === "screenshots" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("screenshots")}
              >
                Screenshots ({screenshots.length})
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto thin-scroll">
          {activeTab === "recording" && hasRecording && (
            <div className="flex flex-col items-center justify-center gap-4 p-4">
              <video
                controls
                className="w-full max-w-2xl rounded-lg border border-border bg-black"
                src={testResult.recording_url}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Format: {testResult.recording_format || "unknown"}</span>
                {testResult.elapsed_ms && (
                  <>
                    <span>·</span>
                    <span>Duration: {(testResult.elapsed_ms / 1000).toFixed(1)}s</span>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "screenshots" && hasScreenshots && (
            <div className="flex flex-col items-center justify-center gap-4 p-4">
              <div className="w-full max-w-2xl">
                <img
                  src={screenshots[currentScreenshot]?.url}
                  alt={`Screenshot ${currentScreenshot + 1}`}
                  className="w-full rounded-lg border border-border bg-muted"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentScreenshot(Math.max(0, currentScreenshot - 1))}
                  disabled={currentScreenshot === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-xs text-muted-foreground">
                  {currentScreenshot + 1} / {screenshots.length}
                  {screenshots[currentScreenshot]?.step && ` · ${screenshots[currentScreenshot].step}`}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentScreenshot(Math.min(screenshots.length - 1, currentScreenshot + 1))}
                  disabled={currentScreenshot === screenshots.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end border-t border-border pt-4">
          {activeTab === "recording" && hasRecording && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const a = document.createElement("a");
                a.href = testResult.recording_url;
                a.download = `recording-${testResult.username}-${testResult.site_key}.${testResult.recording_format || "webm"}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}