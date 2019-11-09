import { EventEmitter } from "events";
import ky from "ky";

import { PlaybackStatus } from "./types/playback-status";

const POLLING_INTERVAL = 1000;
const SPOTIFY_API = "https://api.spotify.com/v1";

export class SpotifyPlayer extends EventEmitter {
  private isPolling = true;
  private playbackState: PlaybackStatus | null = null;
  private trackTimeout: number | undefined;

  constructor(
    private deviceId: string,
    private getOauthToken: () => Promise<string>,
  ) {
    super();

    this.startPolling();
  }

  public destroy() {
    this.isPolling = false;
  }

  public async play(trackUri: string) {
    await this.apiRequest("put", `/me/player/play?device_id=${this.deviceId}`, {
      uris: [trackUri],
    });
  }

  public pause() {
    return this.apiRequest("put", `/me/player/pause?device_id=${this.deviceId}`);
  }

  public resume() {
    return this.apiRequest("put", `/me/player/play?device_id=${this.deviceId}`);
  }

  private async apiRequest(method: string, endpoint: string, json?: any) {
    return ky(`${SPOTIFY_API}${endpoint}`, {
      method,
      json,
      headers: {
        Authorization: `Bearer ${await this.getOauthToken()}`,
      },
      retry: 3,
    }).json();
  }

  private async startPolling() {
    // We use a while loop here instead of setInterval to accomodate
    // for the delay caused by retries or slow connections, et cetera.
    while (this.isPolling) {
      const start = Date.now();

      const res: PlaybackStatus | "" = await ky
        .get(`${SPOTIFY_API}/me/player`, {
          headers: {
            Authorization: `Bearer ${await this.getOauthToken()}`,
          },
        })
        .json();
      if (res) {
        this.onEvent(res);
      }

      const end = Date.now();

      await new Promise(res =>
        setTimeout(res, Math.max(POLLING_INTERVAL - (end - start), 0)),
      );
    }
  }

  private onEvent(ev: PlaybackStatus) {
    this.emit("new_playback_state", ev);

    // Logic
    if (ev.is_playing !== this.playbackState?.is_playing) {
      this.emit("is_playing_changed", ev.is_playing);
    }

    if (ev.progress_ms !== this.playbackState?.progress_ms) {
      this.emit("progress_ms_changed", ev.progress_ms);
    }

    if (ev.progress_ms) {
      clearTimeout(this.trackTimeout);

      const duration = Math.max(0, ev.item?.duration_ms ?? 0 - ev.progress_ms);
      this.trackTimeout = setTimeout(() => {
        this.playbackState = null;
        this.emit("track_finished", ev);
      }, duration);
    }

    if (this.playbackState && ev.item?.uri !== this.playbackState.item?.uri) {
      clearTimeout(this.trackTimeout);
      this.emit("track_finished", ev);
    }

    this.playbackState = ev;
  }
}
