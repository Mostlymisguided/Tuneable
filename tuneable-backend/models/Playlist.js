const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 3, maxlength: 100 },
    description: { type: String },
    tracks: [
      {
        title: { type: String, required: true },
        artist: { type: String },
        platform: { type: String, enum: ['YouTube', 'Spotify', 'SoundCloud', 'Deezer', 'Apple Music'], required: true },
        url: { type: String, required: true },
        bid: { type: Number, default: 0 }, // Default bid is 0
      },
    ],
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Playlist', playlistSchema);
