const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {  // Changed from 'spotifyId' to be platform-agnostic
    type: String,
    required: true,
    unique: true
  },
  platform: {  // Optional: track which platform (youtube, spotify, etc)
    type: String,
    default: 'youtube'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);