import { useEffect, useRef, useState } from "react";
import { IconPlayerPlay as Play } from "@tabler/icons-react";
import { Pause, Volume2, VolumeX, Maximize, Minimize, Gauge, RotateCcw, RotateCw } from "lucide-react"; // TODO: no Tabler mapping found yet

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const PROGRESS_REPORT_INTERVAL_MS = 5000;

export function isDirectPlayableUrl(url: string): boolean {
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".m3u8") || clean.endsWith(".mov");
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClayVideoPlayer({
  src,
  poster,
  autoPlay = false,
  initialTime = 0,
  onProgress,
  onEnded,
}: {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  // Seconds to resume from — the lecture page passes this in from saved
  // progress so a student picks up where they left off.
  initialTime?: number;
  // Fired at most once every 5s while playing, on pause, and on end — the
  // caller (lecture page) uses this to persist watch progress server-side
  // without hammering the API on every timeupdate tick.
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReportRef = useRef(0);
  const hasSeekedToInitial = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    hasSeekedToInitial.current = false;

    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      // Resume from saved progress once, and only if it isn't within the
      // last 5 seconds (avoids immediately re-triggering "completed").
      if (!hasSeekedToInitial.current && initialTime > 0 && initialTime < video.duration - 5) {
        video.currentTime = initialTime;
      }
      hasSeekedToInitial.current = true;
    };
    const reportProgress = () => {
      if (onProgress && video.duration) onProgress(video.currentTime, video.duration);
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const now = Date.now();
      if (onProgress && video.duration && now - lastReportRef.current > PROGRESS_REPORT_INTERVAL_MS) {
        lastReportRef.current = now;
        onProgress(video.currentTime, video.duration);
      }
    };
    const onProgressEvent = () => {
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      reportProgress();
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);
    const onEndedHandler = () => {
      reportProgress();
      onEnded?.();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgressEvent);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEndedHandler);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgressEvent);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEndedHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  function seekTo(fraction: number) {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = fraction * duration;
  }

  function skip(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), duration);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function changeVolume(v: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }

  function changeSpeed(s: (typeof SPEED_OPTIONS)[number]) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = s;
    setSpeed(s);
    setShowSpeedMenu(false);
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen();
  }

  function handleMouseMove() {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (playing) {
      hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 2500);
    }
  }

  const progressFraction = duration > 0 ? currentTime / duration : 0;
  const bufferedFraction = duration > 0 ? buffered / duration : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setControlsVisible(false)}
      className="clay-inset group relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        onClick={togglePlay}
        className="h-full w-full cursor-pointer object-contain"
      />

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}

      {!playing && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30"
          aria-label="Play"
        >
          <span className="clay-btn flex h-16 w-16 items-center justify-center rounded-full">
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </span>
        </button>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-6 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="group/seek relative h-1.5 w-full cursor-pointer rounded-full bg-white/25"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${bufferedFraction * 100}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--sky-deep)]" style={{ width: `${progressFraction * 100}%` }} />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
            style={{ left: `calc(${progressFraction * 100}% - 6px)` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10">
              {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="ml-0.5 h-4 w-4 fill-white" />}
            </button>
            <button onClick={() => skip(-10)} className="hidden h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10 sm:flex" aria-label="Back 10 seconds">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => skip(10)} className="hidden h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10 sm:flex" aria-label="Forward 10 seconds">
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <div className="group/vol flex items-center gap-1.5">
              <button onClick={toggleMute} className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10">
                {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="hidden w-16 accent-[var(--sky-deep)] sm:block"
              />
            </div>

            <span className="ml-1 hidden text-xs font-medium text-white/80 sm:inline">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                <Gauge className="h-3.5 w-3.5" />
                {speed}x
              </button>
              {showSpeedMenu && (
                <div className="clay absolute bottom-full right-0 mb-2 p-1">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeSpeed(s)}
                      className={`block w-full rounded-xl px-3 py-1.5 text-left text-xs font-semibold ${
                        s === speed ? "bg-[var(--sky-soft)] text-foreground" : "text-foreground/70 hover:bg-foreground/5"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={toggleFullscreen} className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Falls back to an iframe for non-direct-playable URLs (embed pages rather
// than raw .m3u8/.mp4 assets). NOTE: progress tracking and resume only work
// through ClayVideoPlayer — an iframe embed can't report playback position,
// so watch-progress features are unavailable for lectures saved with an
// embed-style URL rather than a direct manifest/file URL.
export function VideoPlayer({
  src,
  poster,
  initialTime,
  onProgress,
  onEnded,
}: {
  src: string;
  poster?: string;
  initialTime?: number;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}) {
  if (isDirectPlayableUrl(src)) {
    return (
      <ClayVideoPlayer src={src} poster={poster} initialTime={initialTime} onProgress={onProgress} onEnded={onEnded} />
    );
  }
  return (
    <div className="clay-inset aspect-video w-full overflow-hidden rounded-2xl">
      <iframe src={src} allow="autoplay; fullscreen" allowFullScreen className="h-full w-full border-0" title="Video player" />
    </div>
  );
}