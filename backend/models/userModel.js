const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: { 
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    default: 'youtube'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);