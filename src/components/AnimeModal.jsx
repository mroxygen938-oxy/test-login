import { useEffect, useRef, useState } from 'react'
import { IconImage, IconStar, IconX } from '../lib/icons.jsx'
import { getLists, getModeConfig } from '../lib/lists.js'

const emptyItem = (mode) => ({
  title: '',
  image: '',
  list: getModeConfig(mode).activeStartList,
  totalEpisodes: '',
  watchedEpisodes: 0,
  year: '',
  studio: '',
  rating: 0,
  notes: '',
})

async function fileToDataUrl(file, maxDim = 800) {
  const readerData = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

  // Try to downscale to keep localStorage small.
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = readerData
    })
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.round(img.width * ratio)
    const h = Math.round(img.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return readerData
  }
}

export default function AnimeModal({ open, initial, mediaMode = 'anime', onClose, onSave }) {
  if (!open) return null
  return (
    <AnimeModalInner
      key={`${mediaMode}-${initial?.id || 'new'}`}
      initial={initial}
      mediaMode={mediaMode}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

function AnimeModalInner({ initial, mediaMode, onClose, onSave }) {
  const config = getModeConfig(mediaMode)
  const lists = getLists(mediaMode)
  const [form, setForm] = useState(() => ({ ...emptyItem(mediaMode), ...(initial || {}) }))
  const firstFieldRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80)
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const isEditing = Boolean(initial?.id)

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleFile = async (file) => {
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    update({ image: dataUrl })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const title = (form.title || '').trim()
    if (!title) {
      firstFieldRef.current?.focus()
      return
    }
    const total = form.totalEpisodes === '' ? 0 : Number(form.totalEpisodes)
    const watched = Number(form.watchedEpisodes) || 0
    onSave({
      ...form,
      title,
      totalEpisodes: Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0,
      watchedEpisodes: Math.max(0, Math.floor(watched)),
      rating: Number(form.rating) || 0,
    })
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form className="modal glass-strong" onSubmit={handleSubmit}>
        <header className="modal-header">
          <div>
            <h2 className="modal-title">{isEditing ? config.editTitle : config.addTitle}</h2>
            <div className="modal-sub">
              {isEditing ? 'Update the details and save.' : 'Fill in the basics — only the title is required.'}
            </div>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>

        <div className="modal-body">
          <label
            className="image-upload"
            style={form.image ? { borderStyle: 'solid' } : undefined}
          >
            {form.image ? (
              <>
                <img src={form.image} alt="Cover preview" />
                <div className="change-hint">Click to change cover image</div>
              </>
            ) : (
              <div className="image-upload-hint">
                <IconImage />
                <div>
                  <strong>Upload a cover image</strong>
                  <div style={{ marginTop: 2 }}>Drag &amp; drop or click to browse</div>
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {form.image && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: 'flex-start', fontSize: 12 }}
              onClick={() => update({ image: '' })}
            >
              Remove image
            </button>
          )}

          <div className="field">
            <label className="label" htmlFor="f-title">Title</label>
            <input
              id="f-title"
              ref={firstFieldRef}
              className="input"
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={config.titlePlaceholder}
              required
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="f-list">List</label>
              <select
                id="f-list"
                className="select"
                value={form.list}
                onChange={(e) => update({ list: e.target.value })}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Rating</label>
              <div className="rating-input" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={n === form.rating}
                    className={n <= form.rating ? 'active' : ''}
                    onClick={() => update({ rating: form.rating === n ? 0 : n })}
                  >
                    <IconStar filled={n <= form.rating} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="f-watched">{config.fieldWatchedLabel}</label>
              <input
                id="f-watched"
                className="input"
                type="number"
                min="0"
                value={form.watchedEpisodes}
                onChange={(e) => update({ watchedEpisodes: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-total">{config.fieldTotalLabel}</label>
              <input
                id="f-total"
                className="input"
                type="number"
                min="0"
                placeholder="Leave empty if unknown"
                value={form.totalEpisodes}
                onChange={(e) => update({ totalEpisodes: e.target.value })}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="f-year">Year</label>
              <input
                id="f-year"
                className="input"
                type="number"
                placeholder="2024"
                value={form.year}
                onChange={(e) => update({ year: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-studio">{config.studioLabel}</label>
              <input
                id="f-studio"
                className="input"
                placeholder={config.studioPlaceholder}
                value={form.studio}
                onChange={(e) => update({ studio: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="f-notes">Notes</label>
            <textarea
              id="f-notes"
              className="textarea"
              placeholder="Thoughts, favourite moments, anything worth remembering…"
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isEditing ? 'Save changes' : 'Add to library'}
          </button>
        </div>
      </form>
    </div>
  )
}
