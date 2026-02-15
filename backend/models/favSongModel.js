const mongoose = require('mongoose');

const favSongSchema = new mongoose.Schema({
  artist: {
    type: String,
    required: true
  },
  songTitle: {
    type: String,
    required: true
  },
  user: { 
    type: String,
    required: true
  },
  videoId: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FavSong', favSongSchema);