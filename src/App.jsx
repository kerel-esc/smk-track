import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { useLanguage } from './LanguageContext'
import './App.css'

const TABS = {
  CHECKIN: 'checkin',
  SHARE: 'share',
  CALENDAR: 'calendar',
  CORRELATION: 'correlation',
}

const emptyForm = {
  location: '',
  energy: '',
  mood: '',
  headache_intensity: '',
  headache_type: '',
  diet_main: '',
  hydration_l: '',
  movement_minutes: '',
  sleep_hours: '',
  notes: '',
  medications: '',
  herbs: '',
}

const getWeatherLabel = (code, t) => {
  const map = {
    0: t('weatherClearSky'),
    1: t('weatherMainlyClear'),
    2: t('weatherPartlyCloudy'),
    3: t('weatherOvercast'),
    45: t('weatherFog'),
    48: t('weatherRimeFog'),
    51: t('weatherLightDrizzle'),
    53: t('weatherModerateDrizzle'),
    55: t('weatherDenseDrizzle'),
    61: t('weatherSlightRain'),
    63: t('weatherModerateRain'),
    65: t('weatherHeavyRain'),
    71: t('weatherSlightSnow'),
    73: t('weatherModerateSnow'),
    75: t('weatherHeavySnow'),
    80: t('weatherRainShowers'),
    81: t('weatherRainShowers'),
    82: t('weatherHeavyRainShowers'),
    95: t('weatherThunderstorm'),
  }

  return map[code] || t('unknownWeather')
}

const formatLocationOption = (place) => {
  const parts = [place.name]

  if (place.admin1 && place.admin1 !== place.name) {
    parts.push(place.admin1)
  }

  if (place.country) {
    parts.push(place.country)
  }

  return parts.join(', ')
}

const toDateInputValue = (dateLike) => {
  const date = new Date(dateLike)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateTime = (dateLike) => {
  if (!dateLike) return '—'
  return new Date(dateLike).toLocaleString()
}

function App() {
  const { t, lang, setLang } = useLanguage()

  const [session, setSession] = useState(null)
  const [activeTab, setActiveTab] = useState(TABS.CHECKIN)

  const [entries, setEntries] = useState([])
  const [sharedByMe, setSharedByMe] = useState([])
  const [sharedWithMe, setSharedWithMe] = useState([])

  const [loading, setLoading] = useState(false)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [calendarMessage, setCalendarMessage] = useState('')

  const [formData, setFormData] = useState(emptyForm)
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()))
  const [selectedCalendarItem, setSelectedCalendarItem] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')

  const [weatherData, setWeatherData] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [locationOptions, setLocationOptions] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState('')

  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const [shareForm, setShareForm] = useState({
    recipientEmail: '',
    note: '',
  })

  const recognitionRef = useRef(null)
  const notesRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user?.id) {
      void loadAllData()
    } else {
      setEntries([])
      setSharedByMe([])
      setSharedWithMe([])
      setSelectedCalendarItem(null)
    }
  }, [session])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setSpeechSupported(false)
      return
    }

    setSpeechSupported(true)

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = lang === 'pl' ? 'pl-PL' : 'en-US'

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()

      if (!transcript) return

      setFormData((prev) => ({
        ...prev,
        notes: prev.notes ? `${prev.notes} ${transcript}`.trim() : transcript,
      }))
    }

    recognition.onerror = () => {
      setMessage(t('speechError'))
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => recognition.stop()
  }, [lang, t])

  const ownCalendarItems = useMemo(() => {
    return entries
      .filter((entry) => toDateInputValue(entry.created_at) === selectedDate)
      .map((entry) => ({
        kind: 'own',
        id: entry.id,
        created_at: entry.created_at,
        title: entry.location || t('myEntry'),
        subtitle: entry.weather_status || '',
        owner_email: session?.user?.email || '',
        entry,
      }))
  }, [entries, selectedDate, session, t])

  const sharedCalendarItems = useMemo(() => {
    return sharedWithMe
      .filter((item) => toDateInputValue(item.entry_created_at) === selectedDate)
      .map((item) => ({
        kind: 'shared',
        id: item.entry_id,
        created_at: item.entry_created_at,
        title: item.location || t('sharedEntry'),
        subtitle: item.weather_status || '',
        owner_email: item.owner_email || t('unknownOwner'),
        share_note: item.share_note,
        entry: {
          id: item.entry_id,
          created_at: item.entry_created_at,
          location: item.location,
          weather_status: item.weather_status,
          pressure_hpa: item.pressure_hpa,
          temp_c: item.temp_c,
          energy: item.energy,
          mood: item.mood,
          headache_intensity: item.headache_intensity,
          headache_type: item.headache_type,
          diet_main: item.diet_main,
          hydration_l: item.hydration_l,
          natural_support: item.natural_support,
          movement_minutes: item.movement_minutes,
          sleep_hours: item.sleep_hours,
          notes: item.notes,
          medications: item.medications,
          herbs: item.herbs,
        },
      }))
  }, [sharedWithMe, selectedDate, t])

  const calendarItems = useMemo(() => {
    return [...ownCalendarItems, ...sharedCalendarItems].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
  }, [ownCalendarItems, sharedCalendarItems])

  const loadAllData = async () => {
    setEntriesLoading(true)
    await Promise.all([fetchEntries(), fetchSharedByMe(), fetchSharedWithMe()])
    setEntriesLoading(false)
  }

  const fetchEntries = async () => {
    if (!session?.user?.id) return

    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching entries:', error)
      setCalendarMessage(t('loadError'))
      return
    }

    setEntries(data || [])
  }

  const fetchSharedByMe = async () => {
    if (!session?.user?.id) return

    const { data, error } = await supabase
      .from('shared_access')
      .select('*')
      .eq('owner_user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching shares by me:', error)
      return
    }

    setSharedByMe(data || [])
  }

  const fetchSharedWithMe = async () => {
    const { data, error } = await supabase.rpc('get_entries_shared_with_me')

    if (error) {
      console.error('Error fetching shared entries:', error)
      setCalendarMessage(error.message)
      return
    }

    setSharedWithMe(data || [])
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthMessage(error.message)
    }

    setAuthLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setAuthMessage(error.message)
    } else {
      setAuthMessage(t('signupSuccess'))
    }

    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const resetWeatherState = () => {
    setWeatherData(null)
    setLocationOptions([])
    setSelectedLocationId('')
  }

  const handleLocationInputChange = (e) => {
    const value = e.target.value

    setFormData((prev) => ({
      ...prev,
      location: value,
    }))

    resetWeatherState()
    setMessage('')
  }

  const fetchWeatherForPlace = async (place, clearMessage = true) => {
    if (!place) {
      setMessage(t('selectLocationFirst'))
      return
    }

    setWeatherLoading(true)
    if (clearMessage) setMessage('')
    setWeatherData(null)

    try {
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,surface_pressure,weather_code&timezone=auto`
      )

      const weatherJson = await weatherRes.json()

      if (!weatherJson.current) {
        throw new Error('Weather not available')
      }

      const summaryLocation = formatLocationOption(place)

      setFormData((prev) => ({
        ...prev,
        location: summaryLocation,
      }))

      setWeatherData({
        location: { label: summaryLocation },
        current: {
          temp_c: weatherJson.current.temperature_2m ?? null,
          pressure_hpa:
            weatherJson.current.surface_pressure != null
              ? Math.round(weatherJson.current.surface_pressure)
              : null,
          weather_text:
            weatherJson.current.weather_code != null
              ? getWeatherLabel(weatherJson.current.weather_code, t)
              : t('unknownWeather'),
        },
      })
    } catch (error) {
      console.error('Weather lookup failed:', error.message)
      setMessage(t('weatherError'))
    } finally {
      setWeatherLoading(false)
    }
  }

  const fetchLocationOptions = async () => {
    const location = formData.location.trim()

    if (location.length < 2) {
      setMessage(t('weatherLocationHint'))
      return
    }

    setWeatherLoading(true)
    setMessage('')
    setWeatherData(null)
    setLocationOptions([])
    setSelectedLocationId('')

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=8&language=en&format=json`
      )

      const geoData = await geoRes.json()

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location not found')
      }

      setLocationOptions(geoData.results)

      if (geoData.results.length === 1) {
        const onlyResult = geoData.results[0]
        setSelectedLocationId(String(onlyResult.id))
        await fetchWeatherForPlace(onlyResult, false)
      } else {
        setMessage(t('chooseLocationHelp'))
      }
    } catch (error) {
      console.error('Location lookup failed:', error.message)
      setMessage(t('weatherError'))
    } finally {
      setWeatherLoading(false)
    }
  }

  const handleLocationSelect = async (e) => {
    const nextId = e.target.value
    setSelectedLocationId(nextId)
    setWeatherData(null)

    if (!nextId) return

    const place = locationOptions.find((item) => String(item.id) === nextId)

    if (place) {
      await fetchWeatherForPlace(place)
    }
  }

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setMessage(t('geolocationUnsupported'))
      return
    }

    setWeatherLoading(true)
    setMessage('')
    resetWeatherState()

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${coords.latitude}&longitude=${coords.longitude}&language=en&format=json`
          )

          const geoData = await geoRes.json()

          if (!geoData.results || geoData.results.length === 0) {
            throw new Error('Location not found')
          }

          const place = geoData.results[0]
          setLocationOptions([place])
          setSelectedLocationId(String(place.id))
          await fetchWeatherForPlace(place, false)
        } catch (error) {
          console.error('Geolocation weather failed:', error.message)
          setMessage(t('weatherError'))
          setWeatherLoading(false)
        }
      },
      () => {
        setMessage(t('geolocationDenied'))
        setWeatherLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const startSpeechToText = () => {
    if (!speechSupported || !recognitionRef.current) {
      setMessage(t('speechUnsupported'))
      return
    }

    try {
      recognitionRef.current.lang = lang === 'pl' ? 'pl-PL' : 'en-US'
      recognitionRef.current.start()
      setIsListening(true)
      notesRef.current?.focus()
    } catch {
      setMessage(t('speechError'))
      setIsListening(false)
    }
  }

  const stopSpeechToText = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!session?.user?.id) {
      setMessage(t('authRequired'))
      setLoading(false)
      return
    }

    const entry = {
      location: formData.location || null,
      weather_status: weatherData?.current?.weather_text ?? null,
      pressure_hpa: weatherData?.current?.pressure_hpa ?? null,
      temp_c: weatherData?.current?.temp_c ?? null,
      energy: formData.energy ? parseInt(formData.energy, 10) : null,
      mood: formData.mood ? parseInt(formData.mood, 10) : null,
      headache_intensity: formData.headache_intensity
        ? parseInt(formData.headache_intensity, 10)
        : null,
      headache_type: formData.headache_type || null,
      diet_main: formData.diet_main || null,
      hydration_l: formData.hydration_l ? parseFloat(formData.hydration_l) : null,
      movement_minutes: formData.movement_minutes || null,
      sleep_hours: formData.sleep_hours ? parseFloat(formData.sleep_hours) : null,
      notes: formData.notes || null,
      medications: formData.medications || null,
      herbs: formData.herbs || null,
      user_id: session.user.id,
    }

    const { error } = await supabase.from('entries').insert([entry])

    if (error) {
      console.error('Insert error:', error)
      setMessage(`${t('saveError')}: ${error.message}`)
    } else {
      setMessage(t('saveSuccess'))
      setFormData(emptyForm)
      resetWeatherState()
      await fetchEntries()
      setActiveTab(TABS.CALENDAR)
      setSelectedDate(toDateInputValue(new Date()))
    }

    setLoading(false)
  }

  const handleShareInputChange = (e) => {
    const { name, value } = e.target
    setShareForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleShareAllEntries = async (e) => {
    e.preventDefault()
    setShareMessage('')

    if (!session?.user?.id) {
      setShareMessage(t('authRequired'))
      return
    }

    const normalizedEmail = shareForm.recipientEmail.trim().toLowerCase()

    if (!normalizedEmail) {
      setShareMessage(t('shareRecipientMissing'))
      return
    }

    const { data: recipientProfiles, error: recipientError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', normalizedEmail)
      .limit(1)

    if (recipientError) {
      setShareMessage(recipientError.message)
      return
    }

    if (!recipientProfiles || recipientProfiles.length === 0) {
      setShareMessage(t('shareRecipientNotFound'))
      return
    }

    const recipient = recipientProfiles[0]

    const { error } = await supabase.from('shared_access').upsert(
      [
        {
          owner_user_id: session.user.id,
          recipient_user_id: recipient.id,
          recipient_email: normalizedEmail,
          status: 'active',
          note: shareForm.note || null,
        },
      ],
      {
        onConflict: 'owner_user_id,recipient_user_id',
      }
    )

    if (error) {
      setShareMessage(error.message)
      return
    }

    setShareMessage(t('shareAllSuccess'))
    setShareForm({
      recipientEmail: '',
      note: '',
    })

    await Promise.all([fetchSharedByMe(), fetchSharedWithMe()])
  }

  const handleRevokeShare = async (shareId) => {
    const { error } = await supabase
      .from('shared_access')
      .update({ status: 'revoked' })
      .eq('id', shareId)

    if (error) {
      setShareMessage(error.message)
      return
    }

    setShareMessage(t('revokeSuccess'))
    await Promise.all([fetchSharedByMe(), fetchSharedWithMe()])
  }

  if (!session) {
    return (
      <div className="app-shell">
        <div className="card auth-card">
          <div className="logo">
            <div className="logo-mark">✦</div>
            <h1>{t('loginTitle')}</h1>
            <p className="subtle">{t('loginSubtitle')}</p>
          </div>

          <form className="form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <input
              type="password"
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <div className="button-row">
              <button type="submit" disabled={authLoading}>
                {authLoading ? t('loading') : t('login')}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={authLoading}
                onClick={handleSignup}
              >
                {t('signup')}
              </button>
            </div>
          </form>

          {authMessage ? <div className="message">{authMessage}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="card app-card">
        <div className="header">
          <div>
            <h1>{t('title')}</h1>
            <p className="subtle">{session.user.email}</p>
          </div>

          <div className="header-right">
            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'pl' : 'en')}
            >
              {lang.toUpperCase()}
            </button>

            <button type="button" className="secondary-button" onClick={handleLogout}>
              {t('logout')}
            </button>
          </div>
        </div>

        <main className="app-main-content">
          {activeTab === TABS.CHECKIN && (
            <section className="page-section">
              <div className="section-head">
                <h2>{t('checkinTitle')}</h2>
                <p className="subtle">{t('checkinSubtitle')}</p>
              </div>

              <form className="form" onSubmit={handleSubmit}>
                <div>
                  <label className="input-label">{t('location')}</label>
                  <div className="location-actions-row">
                    <input
                      type="text"
                      className="location-input"
                      placeholder={t('locationPlaceholder')}
                      value={formData.location}
                      onChange={handleLocationInputChange}
                    />

                    <button
                      type="button"
                      className="weather-button"
                      onClick={fetchLocationOptions}
                      disabled={weatherLoading}
                    >
                      {weatherLoading ? t('weatherLoading') : t('fetchWeather')}
                    </button>

                    <button
                      type="button"
                      className="secondary-button weather-button"
                      onClick={useCurrentLocation}
                      disabled={weatherLoading}
                    >
                      {t('usePhoneLocation')}
                    </button>
                  </div>
                </div>

                {locationOptions.length > 0 ? (
                  <div>
                    <label className="input-label">{t('chooseLocation')}</label>
                    <select
                      className="select-input"
                      value={selectedLocationId}
                      onChange={handleLocationSelect}
                    >
                      <option value="">{t('chooseLocationPlaceholder')}</option>
                      {locationOptions.map((place) => (
                        <option key={place.id} value={String(place.id)}>
                          {formatLocationOption(place)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {weatherData ? (
                  <div className="weather-preview">
                    <span className="weather-label">{t('weatherNow')}</span>
                    <p>
                      {weatherData.location.label}
                      {weatherData.current.temp_c !== null ? ` · ${weatherData.current.temp_c}°C` : ''}
                      {weatherData.current.pressure_hpa !== null
                        ? ` · ${weatherData.current.pressure_hpa} hPa`
                        : ''}
                      {weatherData.current.weather_text ? ` · ${weatherData.current.weather_text}` : ''}
                    </p>
                  </div>
                ) : null}

                <div className="compact-grid">
                  <div className="field field-compact">
                    <label className="input-label">{t('energy')}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.energy}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, energy: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-compact">
                    <label className="input-label">{t('mood')}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.mood}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, mood: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-compact">
                    <label className="input-label">{t('sleep')}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={formData.sleep_hours}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, sleep_hours: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-compact">
                    <label className="input-label">{t('water')}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={formData.hydration_l}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, hydration_l: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-wide">
                    <label className="input-label">{t('diet')}</label>
                    <input
                      type="text"
                      value={formData.diet_main}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, diet_main: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-compact">
                    <label className="input-label">{t('physical')}</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={formData.headache_intensity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          headache_intensity: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="field field-wide">
                    <label className="input-label">{t('physicalDescription')}</label>
                    <input
                      type="text"
                      value={formData.headache_type}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, headache_type: e.target.value }))
                      }
                    />
                  </div>

                  <div className="field field-wide">
                    <label className="input-label">{t('movement')}</label>
                    <input
                      type="text"
                      value={formData.movement_minutes}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          movement_minutes: e.target.value,
                        }))
                      }
                      placeholder={t('movementPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid-2">
                  <div>
                    <label className="input-label">{t('medicationsTitle')}</label>
                    <textarea
                      value={formData.medications}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, medications: e.target.value }))
                      }
                      placeholder={t('medicationPlaceholder')}
                      rows="3"
                    />
                  </div>

                  <div>
                    <label className="input-label">{t('herbsTitle')}</label>
                    <textarea
                      value={formData.herbs}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, herbs: e.target.value }))
                      }
                      placeholder={t('herbPlaceholder')}
                      rows="3"
                    />
                  </div>
                </div>

                <div>
                  <div className="notes-head">
                    <label className="input-label">{t('notes')}</label>
                    <div className="notes-actions">
                      {speechSupported ? (
                        <button
                          type="button"
                          className={`secondary-button mic-button ${isListening ? 'mic-button-active' : ''}`}
                          onClick={isListening ? stopSpeechToText : startSpeechToText}
                        >
                          {isListening ? t('stopMic') : t('startMic')}
                        </button>
                      ) : (
                        <span className="subtle">{t('speechUnsupported')}</span>
                      )}
                    </div>
                  </div>

                  <textarea
                    ref={notesRef}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder={t('notesPlaceholder')}
                  />
                </div>

                <button type="submit" disabled={loading}>
                  {loading ? t('saving') : t('save')}
                </button>
              </form>

              {message ? <div className="message">{message}</div> : null}
            </section>
          )}

          {activeTab === TABS.SHARE && (
            <section className="page-section">
              <div className="section-head">
                <h2>{t('shareTitle')}</h2>
                <p className="subtle">{t('shareSubtitle')}</p>
              </div>

              <form className="form" onSubmit={handleShareAllEntries}>
                <div>
                  <label className="input-label">{t('recipientEmail')}</label>
                  <input
                    type="email"
                    name="recipientEmail"
                    value={shareForm.recipientEmail}
                    onChange={handleShareInputChange}
                    placeholder={t('recipientEmailPlaceholder')}
                  />
                </div>

                <div>
                  <label className="input-label">{t('optionalNote')}</label>
                  <textarea
                    name="note"
                    rows="3"
                    value={shareForm.note}
                    onChange={handleShareInputChange}
                    placeholder={t('optionalNotePlaceholder')}
                  />
                </div>

                <button type="submit">{t('shareAllEntries')}</button>
              </form>

              {shareMessage ? <div className="message">{shareMessage}</div> : null}

              <div className="entries-list">
                <div className="section-head">
                  <h3>{t('sharedByMeTitle')}</h3>
                </div>

                {sharedByMe.length === 0 ? (
                  <div className="empty-state">{t('noSharedByMe')}</div>
                ) : (
                  <div className="list">
                    {sharedByMe.map((share) => (
                      <div className="entry" key={share.id}>
                        <div className="entry-meta">{share.recipient_email}</div>
                        <p>
                          {t('status')}: {share.status === 'active' ? t('active') : t('revoked')}
                        </p>
                        {share.note ? (
                          <p>
                            <strong>{t('note')}:</strong> {share.note}
                          </p>
                        ) : null}
                        {share.status === 'active' ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleRevokeShare(share.id)}
                          >
                            {t('revokeAccess')}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === TABS.CALENDAR && (
            <section className="page-section">
              <div className="calendar-head">
                <div>
                  <h2>{t('calendarTitle')}</h2>
                  <p className="subtle">{t('calendarSubtitle')}</p>
                </div>

                <input
                  type="date"
                  className="date-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              {entriesLoading ? (
                <div className="empty-state">{t('calendarLoading')}</div>
              ) : calendarItems.length === 0 ? (
                <div className="empty-state">{t('noEntriesForDate')}</div>
              ) : (
                <div className="list">
                  {calendarItems.map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      className="entry entry-button"
                      onClick={() => setSelectedCalendarItem(item)}
                    >
                      <div className="entry-meta">
                        {item.kind === 'shared'
                          ? `${t('sharedBy')} ${item.owner_email}`
                          : t('myEntry')}
                      </div>
                      <p>{formatDateTime(item.created_at)}</p>
                      <p>{item.title}</p>
                      {item.subtitle ? <p>{item.subtitle}</p> : null}
                    </button>
                  ))}
                </div>
              )}

              <div className="entries-list">
                <div className="section-head">
                  <h3>{t('selectedDetails')}</h3>
                </div>

                {!selectedCalendarItem ? (
                  <div className="empty-state">{t('selectEntryToView')}</div>
                ) : (
                  <div className="entry">
                    <div className="entry-meta">
                      {selectedCalendarItem.kind === 'shared'
                        ? `${t('sharedBy')} ${selectedCalendarItem.owner_email}`
                        : t('myEntry')}
                    </div>

                    <p>
                      <strong>{t('date')}:</strong>{' '}
                      {formatDateTime(selectedCalendarItem.entry.created_at)}
                    </p>
                    <p>
                      <strong>{t('location')}:</strong>{' '}
                      {selectedCalendarItem.entry.location || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('weatherNow')}:</strong>{' '}
                      {selectedCalendarItem.entry.weather_status || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsTemperature')}:</strong>{' '}
                      {selectedCalendarItem.entry.temp_c ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsPressure')}:</strong>{' '}
                      {selectedCalendarItem.entry.pressure_hpa ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsEnergy')}:</strong>{' '}
                      {selectedCalendarItem.entry.energy ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsMood')}:</strong>{' '}
                      {selectedCalendarItem.entry.mood ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsPhysicalIntensity')}:</strong>{' '}
                      {selectedCalendarItem.entry.headache_intensity ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsPhysicalDescription')}:</strong>{' '}
                      {selectedCalendarItem.entry.headache_type || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsDiet')}:</strong>{' '}
                      {selectedCalendarItem.entry.diet_main || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsHydration')}:</strong>{' '}
                      {selectedCalendarItem.entry.hydration_l ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsMovement')}:</strong>{' '}
                      {selectedCalendarItem.entry.movement_minutes || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsSleep')}:</strong>{' '}
                      {selectedCalendarItem.entry.sleep_hours ?? t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsMedications')}:</strong>{' '}
                      {selectedCalendarItem.entry.medications || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsHerbs')}:</strong>{' '}
                      {selectedCalendarItem.entry.herbs || t('noValue')}
                    </p>
                    <p>
                      <strong>{t('detailsNotes')}:</strong>{' '}
                      {selectedCalendarItem.entry.notes || t('noValue')}
                    </p>

                    {selectedCalendarItem.kind === 'shared' && selectedCalendarItem.share_note ? (
                      <p>
                        <strong>{t('shareNote')}:</strong> {selectedCalendarItem.share_note}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {calendarMessage ? <div className="message">{calendarMessage}</div> : null}
            </section>
          )}

          {activeTab === TABS.CORRELATION && (
            <section className="page-section">
              <div className="section-head">
                <h2>{t('correlationTitle')}</h2>
                <p className="subtle">{t('correlationSubtitle')}</p>
              </div>

              <div className="empty-state">{t('correlationPlaceholder')}</div>
            </section>
          )}
        </main>

        <footer className="app-footer-nav" aria-label={t('mainNavigation')}>
          <button
            type="button"
            className={activeTab === TABS.CHECKIN ? 'footer-tab active' : 'footer-tab'}
            onClick={() => setActiveTab(TABS.CHECKIN)}
          >
            {t('tabCheckin')}
          </button>

          <button
            type="button"
            className={activeTab === TABS.SHARE ? 'footer-tab active' : 'footer-tab'}
            onClick={() => setActiveTab(TABS.SHARE)}
          >
            {t('tabShare')}
          </button>

          <button
            type="button"
            className={activeTab === TABS.CALENDAR ? 'footer-tab active' : 'footer-tab'}
            onClick={() => setActiveTab(TABS.CALENDAR)}
          >
            {t('tabCalendar')}
          </button>

          <button
            type="button"
            className={activeTab === TABS.CORRELATION ? 'footer-tab active' : 'footer-tab'}
            onClick={() => setActiveTab(TABS.CORRELATION)}
          >
            {t('tabCorrelation')}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default App