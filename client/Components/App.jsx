import React, { Component } from 'react'
import { connect } from 'react-redux'
import SpotifyLogin from './SpotifyLogin'
import { Container, Col, Row, Spinner } from 'react-bootstrap'
import NavBar from './NavBar'
import AppAuthWrapper from './AppAuthWrapper'
import { restoreSession } from '../store/userSlice'

export class App extends Component {
  componentDidMount() {
    // If we just came back from Spotify with a `?code=` we don't need to
    // probe — the OAuth flow in useAuth will create a fresh server session
    // anyway, and we want to skip the redundant 401 + flash of nothing.
    const hasCode = !!new URLSearchParams(window.location.search).get('code')
    if (hasCode) return
    this.props.restoreSession()
  }

  render() {
    const code = new URLSearchParams(window.location.search).get('code')
    const sessionLoading = this.props.user?.sessionLoading
    const accessToken = this.props.user?.details?.accessToken
    return (
      <Container
        style={{ display: 'flex', maxWidth: '95vw', maxHeight: '95vh' }}
      >
        <Col
          style={{
            maxWidth: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Row>
            <NavBar style={{marginTop: "5px"}} />
          </Row>
          <Row>
            {sessionLoading && !code ? (
              <Col
                className="d-flex justify-content-center align-items-center"
                style={{ minHeight: '60vh' }}
              >
                <Spinner animation="border" variant="light" />
              </Col>
            ) : code || accessToken ? (
              <AppAuthWrapper code={code || null} />
            ) : (
              <SpotifyLogin />
            )}
          </Row>
        </Col>
      </Container>
    )
  }
}

const mapStateToProps = (state) => ({
  user: state.user,
})

const mapDispatchToProps = (dispatch) => ({
  restoreSession: () => dispatch(restoreSession()),
})

export default connect(mapStateToProps, mapDispatchToProps)(App)
