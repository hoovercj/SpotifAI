import React from 'react'
import Container from 'react-bootstrap/Container'
import Card from 'react-bootstrap/Card'

const spotifyRedirect =
  process.env.NODE_ENV === 'production'
    ? process.env.SPOTIFY_REDIRECT_URI_PROD
    : process.env.SPOTIFY_REDIRECT_URI_DEV

// `playlist-read-private` and `playlist-read-collaborative` are required for
// `/v1/me/playlists` to return private/collaborative playlists; without them
// Spotify replies 403.
//
// We deliberately omit `show_dialog=true` so that returning users who have
// already consented to the app are signed in silently (Spotify just redirects
// back with a fresh `code`). If you need to force the account-picker (e.g.
// when debugging an account-mismatch / Dev-Mode allowlist issue), re-add
// `&show_dialog=true` below.
const AUTH_URL = `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${spotifyRedirect}&scope=streaming%20user-read-email%20user-read-private%20user-library-read%20user-library-modify%20user-read-playback-state%20user-modify-playback-state%20playlist-read-private%20playlist-read-collaborative`

export default function SpotifyLogin() {
  return (
    <Container
      className="d-flex justify-content-center align-items-center"
      style={{ minHeight: '75vh' }}
    >
      <span>
        <Card style={{ width: '24rem' }} bg="dark" border="warning">
          <Card.Header className="text-warning h5">
            Beta Notice{' '}
            <Card.Subtitle className="my-1 text-warning">
              Spotify Development Mode
            </Card.Subtitle>
          </Card.Header>
          <Card.Body>
            <Card.Text className="text-light">
              While we await Spotify App Certification, they restrict API access
              to registered developers. If this isn't you, the app will not
              function properly at this time.
            </Card.Text>
            <Card.Text className="text-light">
              In the meantime, refer to these resources:
              <br />
              <span className="ms-3">🎬</span>
              <Card.Link
                href="https://vimeo.com/869263029/f6f59850b1?share=copy"
                className="text-warning ms-2"
              >
                Project Video with Demo
              </Card.Link>
              <br />
              <span className="ms-3">🔉</span>
              <Card.Link
                href="https://portfolio.rev4labs.com/audio/wyou-samples/broadcast-demo-rusty.mp3"
                className="text-warning ms-2"
              >
                Broadcast Audio Demo
              </Card.Link>
              <br />
              <span className="ms-3">💻</span>
              <Card.Link
                href="https://github.com/hoovercj/SpotifAI"
                className="text-warning ms-2"
              >
                Source Code on GitHub
              </Card.Link>
              <br />
              <span className="ms-3">📅</span>
              <Card.Link
                className="text-warning ms-2"
                href="mailto:chris@armbrustermail.com,jejanov@mac.com?subject=Schedule%20WYOU%20Demo"
              >
                Schedule Private Demo
              </Card.Link>
            </Card.Text>

            <div className="text-center">
              <a className="btn btn-success btn-lg my-3" href={AUTH_URL}>
                Login With Spotify
              </a>
            </div>
          </Card.Body>
        </Card>
      </span>
    </Container>
  )
}
