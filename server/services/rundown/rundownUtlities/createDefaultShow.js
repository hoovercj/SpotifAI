function createDefaultShow() {
  return {
    radioStation: "SpotifAI",
    showName: "Default Show",
    date: new Date().toISOString().slice(0, 10),
    rundown: [
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      { type: "weather" },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      { type: "news" },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      { type: "transit" },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      { type: "history" },
      {
        type: "song",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
      {
        type: "end",
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
    ],
  };
}

module.exports = { createDefaultShow };

