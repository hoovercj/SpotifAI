import React, { Component } from "react"
import { connect } from "react-redux"
import { Loader2 } from "lucide-react"
import SpotifyLogin from "./SpotifyLogin"
import AppAuthWrapper from "./AppAuthWrapper"
import { restoreSession } from "../store/userSlice"

/**
 * Top-level gate: decides whether to show the login card or the
 * authenticated AppShell. Owns the initial session restore probe.
 */
export class App extends Component {
  componentDidMount() {
    // Skip the probe when arriving from the OAuth callback — useAuth will
    // mint a fresh session via /api/spotify/login, so the probe would just
    // 401 and flash the login card.
    const hasCode = !!new URLSearchParams(window.location.search).get("code")
    if (hasCode) return
    this.props.restoreSession()
  }

  render() {
    const code = new URLSearchParams(window.location.search).get("code")
    const sessionLoading = this.props.user?.sessionLoading
    const accessToken = this.props.user?.details?.accessToken

    if (sessionLoading && !code) {
      return (
        <div className="grid min-h-dvh w-full place-items-center bg-background text-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" />
        </div>
      )
    }

    if (code || accessToken) {
      return <AppAuthWrapper code={code || null} />
    }

    return (
      <div className="grid min-h-dvh w-full place-items-center bg-background px-4 py-10 text-foreground">
        <SpotifyLogin />
      </div>
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
