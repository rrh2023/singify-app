import axios from 'axios'
import React, {useState, useEffect} from 'react'

const Song = (props) => {
  const API_URL = "https://singify-app.vercel.app"

    const [showLyrics, setShowLyrics]= useState(false)
    const [lyrics, setLyrics]  = useState({
        text: ''
    })
    const [isFavorite, setIsFavorite] = useState(false)

    useEffect( () => {
        fetch(`${API_URL}/checkIfFavorite/${props.artist}/${props.songTitle}`).then(res => {
            if(res.ok){
                return res.json()
            }
            }).then(res => {
                console.log(res)
                setIsFavorite(res.favorited)  
            })
            .catch(err => console.log(err))
    }, [])

    

    async function getLyrics(artist, songTitle) {

        await fetch(`${API_URL}/getlyrics/${artist}/${songTitle}`).then(res => {
            if(res.ok){
              return res.json()
            }
          })
          .then(data => {
            setLyrics(() => {
                return ({
                    text: data.lyrics
                })
            })  
          })
          .catch(err => console.log(err))
    }

    async function favoriteSong(){
        axios.post(`${API_URL}/favorite/${props.artist}/${props.songTitle}`)
        setIsFavorite(true)
    }

  return (
    <div className='artist'>
        <h6 className='art1'>{props.artist}</h6>
        <h6 className='art2'>{props.songTitle}</h6>

        { showLyrics === false ?
        <button onClick={() => {
            setShowLyrics(!showLyrics)
            getLyrics(props.artist, props.songTitle)
            }}>
            Show Lyrics
        </button>
        :
        <div>
            <button onClick={() => {setShowLyrics(!showLyrics)}}>
                Hide Lyrics
            </button>
            <span>{lyrics.text}</span>
        </div>
        }
        {!isFavorite && props.auth && <button onClick={favoriteSong}>Favorite</button>}
        {isFavorite && <span style={{color: "red"}}> &hearts; </span>}
    </div>
    )
}

export default Song