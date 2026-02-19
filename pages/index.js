import { useState } from 'react'
import Head from 'next/head'
import styles from '@styles/Tracking.module.css'

const formatEventDate = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('es-ES', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getEventTimestamp = (event) => event?.timestamp || event?.date || ''

const getEventDetail = (event) => event?.detail || event?.location || ''

const getEventStatus = (event) => event?.status || event?.detail || 'Actualización de estado'

const formatEventMeta = (event) => {
  const parts = [getEventDetail(event), formatEventDate(getEventTimestamp(event))].filter(Boolean)
  return parts.join(' - ')
}

const MAX_TRACKING_LENGTH = 13
const TRACKING_PATTERN = /^[A-Za-z]{3}98211[0-9]{5}$/

const getTrackingWarning = (value) => {
  if (!value) {
    return ''
  }
  if (value.length > MAX_TRACKING_LENGTH) {
    return `Máximo ${MAX_TRACKING_LENGTH} caracteres.`
  }
  if (value.length === MAX_TRACKING_LENGTH && !TRACKING_PATTERN.test(value)) {
    return 'Formato inválido. Usa AAA98211#####.'
  }
  return ''
}

const getSubmitWarning = (value) => {
  if (!value) {
    return ''
  }
  if (value.length !== MAX_TRACKING_LENGTH) {
    return `Completa ${MAX_TRACKING_LENGTH} caracteres: AAA98211#####.`
  }
  if (!TRACKING_PATTERN.test(value)) {
    return 'Formato inválido. Usa AAA98211#####.'
  }
  return ''
}

export default function Home() {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [timeline, setTimeline] = useState(null)
  const [error, setError] = useState('')
  const [inputWarning, setInputWarning] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleTrackingChange = (event) => {
    const nextValue = event.target.value
    const warning = getTrackingWarning(nextValue)
    const limitedValue =
      nextValue.length > MAX_TRACKING_LENGTH
        ? nextValue.slice(0, MAX_TRACKING_LENGTH)
        : nextValue

    setTrackingNumber(limitedValue)
    setInputWarning(warning)
    if (error) {
      setError('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    const normalized = trackingNumber.trim()
    if (!normalized) {
      setTimeline(null)
      setInputWarning('')
      setError('Ingresa un número de seguimiento para continuar.')
      return
    }
    const submitWarning = getSubmitWarning(normalized)
    if (submitWarning) {
      setTimeline(null)
      setInputWarning(submitWarning)
      return
    }

    setInputWarning('')

    setIsLoading(true)
    try {
      const response = await fetch(`/api/track?tracking=${encodeURIComponent(normalized)}`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to fetch tracking data.')
      }
      setTimeline(payload)
    } catch (err) {
      setTimeline(null)
      setError(err.message || 'No pudimos obtener el seguimiento. Prueba con otro número.')
    } finally {
      setIsLoading(false)
    }
  }

  const orderedEvents = timeline ? [...timeline.events].slice().reverse() : []
  const lastStatus = timeline?.last_status
  const lastMeta = lastStatus ? formatEventMeta(lastStatus) : ''
  const hasEvents = orderedEvents.length > 0

  return (
    <div className={styles.page}>
      <Head>
        <title>Parcel Path | Seguimiento</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.topBar}>
          <div className={styles.logoWrap}>
            <img src="/logo.png" alt="Parcel Path" className={styles.logo} />
          </div>
        </div>
        <section className={styles.hero}>
          <span className={styles.badge}>Rastreador de envíos en vivo</span>
          <h1 className={styles.title}>Sigue cada paso de tu paquete.</h1>
          <p className={styles.subtitle}>
            Ingresa tu número de seguimiento y obtén una línea de tiempo clara con cada escaneo,
            traslado y movimiento.
          </p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.inputGroup} htmlFor="tracking-number">
              <span className={styles.inputIcon} aria-hidden="true">
                #
              </span>
              <input
                id="tracking-number"
                className={styles.input}
                type="text"
                aria-describedby={inputWarning ? 'tracking-warning' : undefined}
                aria-invalid={Boolean(inputWarning)}
                value={trackingNumber}
                onChange={handleTrackingChange}
                placeholder="Ej: SCL9821100087"
                autoComplete="off"
              />
            </label>
            <button className={styles.button} type="submit" disabled={isLoading}>
              {isLoading ? 'Rastreando...' : 'Rastrear envío'}
            </button>
          </form>
          <p className={styles.helper}>Consejo: prueba SCL9821100087 para ver una demo.</p>
          {inputWarning ? (
            <p className={styles.warning} role="alert" id="tracking-warning">
              {inputWarning}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className={styles.card}>
          {timeline ? (
            <>
              <div className={styles.summary}>
                <div>
                  <span className={styles.label}>Número de seguimiento</span>
                  <div className={styles.tracking}>{timeline.shipping}</div>
                </div>
                {lastStatus ? (
                  <div className={styles.statusBadge}>{getEventStatus(lastStatus)}</div>
                ) : null}
              </div>
              {lastStatus && lastMeta ? (
                <p className={styles.sub}>Último escaneo - {lastMeta}</p>
              ) : null}
              {hasEvents ? (
                <ul className={styles.timeline}>
                  {orderedEvents.map((event, index) => (
                    <li
                      className={styles.timelineItem}
                      key={`${getEventTimestamp(event) || event.status || index}-${index}`}
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineContent}>
                        <div className={styles.eventStatus}>{getEventStatus(event)}</div>
                        <div className={styles.eventMeta}>
                          {formatEventMeta(event)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.noActivity} role="status">
                  Aún no hay actividad registrada para este envío. Vuelve a consultar en unas horas.
                </p>
              )}
            </>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIllustration} aria-hidden="true" />
              <div>
                <h2 className={styles.emptyTitle}>La línea de tiempo está lista.</h2>
                <p className={styles.emptyText}>
                  Ingresa un número de seguimiento para ver cada punto de control.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
