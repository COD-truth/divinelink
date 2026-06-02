import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2 } from "lucide-react";

interface Props {
  /** Existing recording (replay mode) */
  existingBlob?: Blob;
  initialTranscript?: string;
  onChange?: (blob: Blob | null, transcript: string) => void;
  disabled?: boolean;
}

/**
 * Voice recorder using MediaRecorder + Web Speech API for live transcription.
 * Stores audio as a webm Blob. Transcript is editable.
 */
export function VoiceRecorder({ existingBlob, initialTranscript = "", onChange, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(existingBlob ?? null);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recogRef = useRef<any>(null);
  const startTsRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = blob ? URL.createObjectURL(blob) : null;

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (recogRef.current) try { recogRef.current.stop(); } catch {}
    if (mrRef.current && mrRef.current.state !== "inactive") try { mrRef.current.stop(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        stream.getTracks().forEach(t => t.stop());
        onChange?.(b, transcript);
      };
      mr.start();
      mrRef.current = mr;
      startTsRef.current = Date.now();
      setDuration(0);
      tickRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTsRef.current) / 1000));
      }, 250);
      setRecording(true);

      // Live transcription (best-effort, may not exist in all browsers)
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        try {
          const recog = new SR();
          recog.lang = navigator.language || "fr-FR";
          recog.continuous = true;
          recog.interimResults = true;
          recog.onresult = (ev: any) => {
            let final = "";
            for (let i = 0; i < ev.results.length; i++) {
              if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
            }
            if (final) setTranscript(prev => (prev + " " + final).trim());
          };
          recog.start();
          recogRef.current = recog;
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("Microphone access denied", e);
    }
  };

  const stop = () => {
    if (mrRef.current && mrRef.current.state !== "inactive") mrRef.current.stop();
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (recogRef.current) try { recogRef.current.stop(); } catch {}
    setRecording(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const clear = () => {
    setBlob(null);
    setTranscript("");
    setDuration(0);
    onChange?.(null, "");
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-md border p-3 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        {!recording && !blob && (
          <Button type="button" size="sm" onClick={start} disabled={disabled} className="gap-2">
            <Mic className="w-4 h-4" /> Enregistrer / Record
          </Button>
        )}
        {recording && (
          <Button type="button" size="sm" variant="destructive" onClick={stop} className="gap-2">
            <Square className="w-4 h-4" /> Stop · {fmt(duration)}
          </Button>
        )}
        {blob && !recording && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={togglePlay} className="gap-2">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "Pause" : "Lire / Play"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clear} className="gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Supprimer / Delete
            </Button>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                className="hidden"
              />
            )}
          </>
        )}
        {recording && (
          <span className="text-xs text-destructive animate-pulse">● REC</span>
        )}
      </div>
      <textarea
        className="w-full text-sm rounded-md border bg-background p-2 min-h-[60px]"
        placeholder="Transcription (modifiable) / Transcript (editable)"
        value={transcript}
        onChange={e => { setTranscript(e.target.value); onChange?.(blob, e.target.value); }}
        disabled={disabled}
      />
    </div>
  );
}
