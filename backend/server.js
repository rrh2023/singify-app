const express = require('express');
const app = express();
const cors = require('cors');
const request = require('request');
const mongoose = require('mongoose');
const User = require("./models/userModel");
const favSong = require("./models/favSongModel");
const { google } = require('googleapis');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const {
  YOUTUBECLIENTID,
  YOUTUBECLIENTSECRET,
  REDIRECTURI,
  TICKETMASTERAPIKEY,
  MONGOURI
} = process.env;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Connect to MongoDB
let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const db = await mongoose.connect(MONGOURI);
  isConnected = db.connections[0].readyState;
}

// YouTube OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  YOUTUBECLIENTID,
  YOUTUBECLIENTSECRET,
  REDIRECTURI
);

let curYouTubeUser = {};
let usersSubscriptions = {};

// ============= AUTHENTICATION ROUTES =============

app.get('/login', function(req, res) {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });
  
  res.redirect(url);
});

app.get('/callback', async function(req, res) {
  const code = req.query.code;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log("Logged in from server, access token retrieved");
    
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    curYouTubeUser = userInfo.data;
    console.log("Current user's YouTube profile info retrieved");
    
    const existingUser = await User.findOne({ userId: curYouTubeUser.id });
    if (existingUser) {
      console.log("User already registered in db");
    } else {
      const newUser = new User({
        name: curYouTubeUser.name,
        userId: curYouTubeUser.id,
        platform: 'youtube'
      });
      await newUser.save();
      console.log('New user added to db');
    }
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const subscriptions = await youtube.subscriptions.list({
      part: 'snippet',
      mine: true,
      maxResults: 50
    });
    
    usersSubscriptions = subscriptions.data;
    console.log('User subscriptions retrieved');
    
    res.redirect(`${FRONTEND_URL}/`);
    
  } catch (error) {
    console.error('Error during authentication:', error);
    res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
  }
});

app.get("/health", (req, res) => {
  res.send("Singify API is running 🚀");
});


app.get('/logout', function(req, res) {
  oauth2Client.setCredentials({});
  curYouTubeUser = {};
  usersSubscriptions = {};
  console.log("Logged out from server");
  res.send({ success: true });
});

app.get('/checkAuth', function(req, res) {
  const credentials = oauth2Client.credentials;
  if (credentials && credentials.access_token) {
    res.send({ auth: true, user: curYouTubeUser });
  } else {
    res.send({ auth: false });
  }
});

// ============= USER DATA ROUTES =============

app.get('/getUserInfo', function(req, res) {
  if (curYouTubeUser && curYouTubeUser.id) {
    res.send({ user: curYouTubeUser });
  } else {
    res.status(401).send({ error: 'Not authenticated' });
  }
});

app.get('/getUsersSubscriptions', function(req, res) {
  console.log('Getting user subscriptions');
  res.send(usersSubscriptions);
});

// ============= FAVORITES ROUTES =============

app.get('/checkIfFavorite/:artist/:songTitle', async function(req, res) {
  await connectDB();
  try {
    const check = await favSong.findOne({ 
      artist: req.params.artist, 
      songTitle: req.params.songTitle, 
      user: curYouTubeUser.id
    });
    
    if (check) {
      console.log("User saved song");
      res.send({ favorited: true, songId: check._id });
    } else {
      console.log("User did not save song");
      res.send({ favorited: false });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/favorite/:artist/:songTitle', async function(req, res) {
  try {
    const newFavSong = new favSong({
      artist: req.params.artist,
      songTitle: req.params.songTitle,
      user: curYouTubeUser.id,
      videoId: req.body.videoId || null
    });
    await newFavSong.save();
    console.log("New favorited song in db");
    res.send({ success: true, song: newFavSong });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get('/favsongs', async function(req, res) {
  await connectDB();
  try {
    const songs = await favSong.find({ user: curYouTubeUser.id }).sort({ createdAt: -1 });
    console.log(`Found ${songs.length} favorite songs`);
    res.send({ songs });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.delete('/delete/:id', async function(req, res) {
  await connectDB();
  try {
    await favSong.findByIdAndDelete(req.params.id);
    console.log('Deleted a song');
    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ============= LYRICS API ROUTES =============

app.get("/lyricssearch/:searchterm", (req, res) => {
  const searchTerm = req.params.searchterm;
  
  request(`https://api.lyrics.ovh/suggest/${searchTerm}`, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.send(body);
    } else {
      res.status(500).send({ error: error || 'Search failed' });
    }
  });
});

app.get("/getlyrics/:artist/:songTitle", (req, res) => {
  const { artist, songTitle } = req.params;
  
  request.get(`https://api.lyrics.ovh/v1/${artist}/${songTitle}`, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.send(body);
    } else {
      res.status(500).send({ error: error || 'Lyrics not found' });
    }
  });
});

// ============= TICKETMASTER API ROUTES =============

// Search for artist events
app.get('/artist/:name/events', async function(req, res) {
  const artistName = req.params.name;
  
  try {
    const response = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?keyword=${encodeURIComponent(artistName)}&classificationName=music&apikey=${TICKETMASTERAPIKEY}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch events from Ticketmaster');
    }
    
    const data = await response.json();
    
    res.send({
      artist: artistName,
      events: data._embedded?.events || [],
      page: data.page,
      totalEvents: data.page?.totalElements || 0
    });
  } catch (error) {
    console.error('Error fetching artist events:', error);
    res.status(500).send({ error: error.message });
  }
});

// Get specific event details
app.get('/event/:eventId', async function(req, res) {
  try {
    const response = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events/${req.params.eventId}.json?apikey=${TICKETMASTERAPIKEY}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch event details');
    }
    
    const data = await response.json();
    res.send(data);
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).send({ error: error.message });
  }
});

// Advanced event search
app.get('/events/search', async function(req, res) {
  const { artist, city, stateCode, countryCode, radius, startDate, endDate } = req.query;
  
  try {
    let url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTERAPIKEY}&classificationName=music`;
    
    if (artist) url += `&keyword=${encodeURIComponent(artist)}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (stateCode) url += `&stateCode=${stateCode}`;
    if (countryCode) url += `&countryCode=${countryCode}`;
    if (radius) url += `&radius=${radius}`;
    if (startDate) url += `&startDateTime=${startDate}`;
    if (endDate) url += `&endDateTime=${endDate}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to search events');
    }
    
    const data = await response.json();
    
    res.send({
      events: data._embedded?.events || [],
      page: data.page,
      totalEvents: data.page?.totalElements || 0
    });
  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).send({ error: error.message });
  }
});

module.exports = app