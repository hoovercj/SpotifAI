import React, { useEffect, useState } from 'react'
import { connect } from 'react-redux'
import { fetchUserStations } from '../store/stationsSlice'
import { fetchDjs } from '../store/djsSlice'
import useAuth from './useAuth'
import Radio from './Radio'
import Home from './Home'
import { Routes, Route } from 'react-router-dom'
import UserProfile from './UserProfile'
import { showProfile } from '../store/userSlice'
import { Col, Row } from 'react-bootstrap'

const AppAuthWrapper = (props) => {
  const accessToken = useAuth(props.code)

  useEffect(() => {
    console.log('AppAuthWrapper useEffect', accessToken)
    props.fetchDjs()
    if (accessToken) {
      // Spotify deprecated Dev-Mode access to algorithmic/editorial
      // playlists in Nov 2024 (the hard-coded `37i9dQZF1...` seed list used
      // to live here). We now only show playlists owned by the signed-in
      // user.
      props.fetchUserStations()
    }
  }, [accessToken])

  return (
    <Col>
      <Row>
        <UserProfile />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="radio/*" element={<Radio />} />
        </Routes>
      </Row>
    </Col>
  )
}

const mapStateToProps = (state) => ({
  accessToken: state.user?.accessToken,
  profile: state.user?.profile,
})

const mapDispatchToProps = (dispatch) => ({
  fetchUserStations: () => dispatch(fetchUserStations()),
  fetchDjs: () => dispatch(fetchDjs()),
  showProfile: () => dispatch(showProfile()),
})

export default connect(mapStateToProps, mapDispatchToProps)(AppAuthWrapper)
