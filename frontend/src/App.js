const express = require('express')
const app = express()
const cors = require('cors')
const request = require('request')
const mongoose = require('mongoose')
const User = require("./models/userModel")
const favSong = require("./models/favSongModel")
const { google } = require('googleapis')

// include keys & secrets
const {youtube_client_id, youtube_client_secret, redirect_uri, apiKey, mongoPassword} = require("./keys.js")

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// connect to mongoDB
const mongoUri = `mongodb+srv://robherndon2023_db_user:${mongoPassword}@cluster0.t4uqbkf.mongodb.net/?appName=Cluster0`
mongoose.connect(mongoUri)

// YouTube OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  youtube_client_id,
  youtube_client_secret,
  redirect_uri
)

let curYouTubeUser = {} // current user
let usersSubscriptions = {} // subscribed channels

// YouTube API Calls
app.get('/login', function(req, res) {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  })
  
  res.redirect(url)
})

app.get('/callback', async function(req, res) {
  const code = req.query.code
  
  try {
    // Get access token
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)
    
    console.log("logged in from server, access token retrieved")
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()
    curYouTubeUser = userInfo.data
    
    console.log("current user's YouTube profile info retrieved")
    
    // Save user to database
    const existingUser = await User.findOne({ spotifyId: curYouTubeUser.id })
    if (existingUser) {
      console.log("User already registered in db")
    } else {
      const newUser = new User({
        name: curYouTubeUser.name,
        spotifyId: curYouTubeUser.id // Consider renaming to 'userId' or 'youtubeId'
      })
      await newUser.save()
      console.log('new user in db')
    }
    
    // Get user's subscriptions (equivalent to followed artists)
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
    const subscriptions = await youtube.subscriptions.list({
      part: 'snippet',
      mine: true,
      maxResults: 15
    })
    
    usersSubscriptions = subscriptions.data
    console.log('usersSubscriptions retrieved')
    
    res.redirect('http://localhost:3000/')
    
  } catch (error) {
    console.error('Error during authentication:', error)
    res.redirect('http://localhost:3000/?error=auth_failed')
  }
})

app.get('/logout', function(req, res){
  oauth2Client.setCredentials({})
  curYouTubeUser = {}
  usersSubscriptions = {}
  console.log("logged out from server")
  res.send({ success: true })
})

app.get('/checkAuth', function(req, res){
  const credentials = oauth2Client.credentials
  if(credentials && credentials.access_token){
    res.send({auth: true})
  } else {
    res.send({auth: false})
  }
})

app.get('/checkIfFavorite/:artist/:songTitle', async function(req, res){
  const check = await favSong.findOne({ 
    artist: req.params.artist, 
    songTitle: req.params.songTitle, 
    user: curYouTubeUser.id
  })
  
  if(check){
    console.log("user saved song")
    res.send({favorited: true})
  } else {
    console.log("user did not save song")
    res.send({favorited: false})
  }
})

app.post('/favorite/:artist/:songTitle', function(req, res){
  const newFavSong = new favSong({
    artist: req.params.artist,
    songTitle: req.params.songTitle,
    user: curYouTubeUser.id
  })
  newFavSong.save()
  console.log("new favorited song in db")
  res.send({ success: true })
})

app.get('/favsongs', async function(req, res){
  const songs = await favSong.find({user: curYouTubeUser.id})
  res.send({songs})
})

app.get('/getUsersSubscriptions', function(req, res){
  console.log('getting user subscriptions')
  res.send(usersSubscriptions)
})

app.get("/delete/:id", async function(req, res){
  await favSong.findByIdAndDelete(req.params.id)
  console.log('deleted a song')
  res.send({ success: true })
})

// Lyrics.ovh API calls (unchanged)
app.get("/lyricssearch/:searchterm", (req, res) => {
  let searchTerm = req.params.searchterm
  
  request(`https://api.lyrics.ovh/suggest/${searchTerm}`, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.send(body)
    } else {
      res.send(error)
    }
  })
})

app.get("/getlyrics/:artist/:songTitle", (req, res) => {
  let {artist, songTitle} = req.params
  
  request.get(`https://api.lyrics.ovh/v1/${artist}/${songTitle}`, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.send(body)
    } else {
      res.send(error)
    }
  })
})

// Songkick API (unchanged)
app.get('/artist/:name', function(req, res){
  var options = {
    url: `https://api.songkick.com/api/3.0/search/artists.json?apikey=${apiKey}&query=${req.params.name}`,
    json: true
  }
  
  request.get(options, async function(error, response, body) {
    let artistInfo = await body.resultsPage.results.artist[0]
    let artistId = artistInfo.id
    
    var options2 = {
      url: `https://api.songkick.com/api/3.0/artists/${artistId}/calendar.json?apikey=${apiKey}`,
      json: true
    }
    
    request.get(options2, async function(error, response, body) {
      let events = await body.resultsPage
      res.send(events)
    })
  })
})

const PORT = 3001

app.listen(PORT, () => {
  console.log(`Express server is running on port ${PORT}`)
})