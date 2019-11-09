let scriptPromise: Promise<void>;

const injectScriptIfNeccesary = () => {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise(res => {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = res;
  });

  return scriptPromise;
};

export const create = async (
  getOauthToken: () => Promise<string>,
  playerName: string,
  volume: number = 1,
): Promise<[string, Spotify.SpotifyPlayer]> => {
  await injectScriptIfNeccesary();

  const player = new Spotify.Player({
    getOAuthToken: cb => getOauthToken().then(cb),
    name: playerName,
    volume,
  });

  return new Promise((res, rej) => {
    player.on("authentication_error", rej);
    player.on("account_error", rej);
    player.on("initialization_error", rej);

    player.on("ready", ({ device_id }) => {
      player.removeListener("authentication_error", rej);
      player.removeListener("account_error", rej);
      player.removeListener("initialization_error", rej);

      res([device_id, player]);
    });

    player.connect();
  });
};
