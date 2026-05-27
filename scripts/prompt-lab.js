#!/usr/bin/env node
/**
 * SpotifAI Prompt Lab — programmatic harness for every prompt surface
 * in the app. Run with:
 *
 *   npm run prompt -- <command> [flags]
 *
 * Or directly:
 *
 *   node scripts/prompt-lab.js <command> [flags]
 *
 * Commands:
 *   list      Enumerate djs / voices / stations / genres (no LLM call)
 *   persona   Print a DJ's system prompt (no LLM call)
 *   intro     Generate an AI station intro: LLM → WAV in public/audio/
 *   tts       Synthesize arbitrary text with a Gemini voice ID
 *   tracks-prompt
 *             Print the LLM prompt for a station's track list (no LLM call)
 *   tracks    Generate (title, artist) candidates via Gemini — skips Spotify
 *   chat      One-shot message to a DJ persona chat session
 *
 * Every Gemini-touching command prints the prompt that went in AND the
 * response that came out, so iteration is: edit prompt source → rerun
 * → eyeball / play output.
 */
'use strict'

require('dotenv').config()

const path = require('node:path')
const { parseArgs } = require('node:util')

const COMMANDS = {
  list: { handler: cmdList, help: 'list <djs|voices|stations|genres>' },
  persona: { handler: cmdPersona, help: 'persona --dj <id>' },
  intro: {
    handler: cmdIntro,
    help:
      'intro --genre <id> --station <id> [--dj <id>] [--mode cold|warm] [--no-tts]',
  },
  tts: {
    handler: cmdTts,
    help: 'tts --voice <name> --text "..." [--name <fileBase>]',
  },
  'tracks-prompt': {
    handler: cmdTracksPrompt,
    help: 'tracks-prompt --genre <id> --station <id>',
  },
  tracks: {
    handler: cmdTracks,
    help: 'tracks --genre <id> --station <id>',
  },
  chat: {
    handler: cmdChat,
    help: 'chat --dj <id> --prompt "..."',
  },
}

async function main() {
  const [, , cmdName, ...rest] = process.argv
  if (!cmdName || cmdName === '--help' || cmdName === '-h') {
    printHelp()
    process.exit(cmdName ? 0 : 1)
  }
  const cmd = COMMANDS[cmdName]
  if (!cmd) {
    console.error(`Unknown command: ${cmdName}\n`)
    printHelp()
    process.exit(1)
  }
  try {
    await cmd.handler(rest)
  } catch (err) {
    console.error(`\nCommand "${cmdName}" failed:`, err?.message || err)
    if (process.env.DEBUG) console.error(err)
    process.exit(1)
  }
}

function printHelp() {
  console.log('SpotifAI Prompt Lab\n')
  console.log('Usage: npm run prompt -- <command> [flags]\n')
  console.log('Commands:')
  for (const [name, { help }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(16)} ${help}`)
  }
  console.log('\nGlobal flags:')
  console.log('  --help, -h     Show this help')
  console.log('  DEBUG=1        Print full stack traces on error')
}

function banner(title) {
  const line = '─'.repeat(Math.max(8, Math.min(60, title.length + 2)))
  console.log(`\n┌${line}\n│ ${title}\n└${line}`)
}

function section(title, body) {
  banner(title)
  console.log(body)
}

// ─── list ──────────────────────────────────────────────────────────────────

async function cmdList(argv) {
  const [target] = argv
  switch (target) {
    case 'djs': {
      const { djCharacters } = require('../server/services/djCharacters')
      const all = await djCharacters()
      for (const dj of all) {
        console.log(
          `  #${dj.id}  ${dj.djName.padEnd(14)} voice=${dj.details.voiceID}`
        )
      }
      return
    }
    case 'voices': {
      // A small curated list of Gemini prebuilt voices. Each persona
      // pins a specific one in personas/*.md; the rest are useful
      // alternatives to A/B against. Full 30-voice catalog:
      // https://ai.google.dev/gemini-api/docs/speech-generation#voices
      const VOICES = [
        ['Algenib', 'gravelly — Rusty'],
        ['Autonoe', 'bright — M-Quake'],
        ['Sadaltager', 'knowledgeable — Nigel'],
        ['Sulafat', 'warm — Lady Lyric'],
        ['Puck', 'upbeat'],
        ['Zephyr', 'bright'],
        ['Charon', 'informative'],
        ['Kore', 'firm'],
        ['Fenrir', 'excitable'],
        ['Aoede', 'breezy'],
        ['Gacrux', 'mature'],
        ['Achird', 'friendly'],
      ]
      for (const [v, blurb] of VOICES) {
        console.log(`  ${v.padEnd(12)} ${blurb}`)
      }
      console.log(
        '\n  (Any Gemini prebuilt voice name works; see Google docs for the full 30-voice list.)'
      )
      return
    }
    case 'stations': {
      const { CATALOG } = require('../server/services/aiStations/catalog')
      for (const [genreId, genre] of Object.entries(CATALOG)) {
        console.log(`\n${genreId}  (${genre.name})`)
        for (const s of genre.stations) {
          console.log(
            `  ${s.id.padEnd(16)} ${s.name.padEnd(24)} djId=${s.djId}`
          )
        }
      }
      return
    }
    case 'genres': {
      const { CATALOG } = require('../server/services/aiStations/catalog')
      for (const [genreId, genre] of Object.entries(CATALOG)) {
        console.log(
          `  ${genreId.padEnd(10)} ${genre.name}  (${genre.stations.length} stations)`
        )
      }
      return
    }
    default:
      throw new Error('list target required: djs | voices | stations | genres')
  }
}

// ─── persona ───────────────────────────────────────────────────────────────

async function cmdPersona(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { dj: { type: 'string' } },
    allowPositionals: false,
  })
  if (!values.dj) throw new Error('--dj <id> required')
  const { djCharacters } = require('../server/services/djCharacters')
  const {
    buildDJSystemPrompt,
  } = require('../server/services/llm/buildDJSystemPrompt')
  const persona = await djCharacters(values.dj)
  if (!persona) throw new Error(`No DJ with id=${values.dj}`)
  section(
    `DJ #${persona.id} — ${persona.djName}`,
    `voiceID: ${persona.details.voiceID}`
  )
  section('System prompt', buildDJSystemPrompt(persona))
}

// ─── intro ─────────────────────────────────────────────────────────────────

async function cmdIntro(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dj: { type: 'string' },
      genre: { type: 'string' },
      station: { type: 'string' },
      mode: { type: 'string', default: 'cold' },
      'no-tts': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  if (!values.genre || !values.station)
    throw new Error('--genre and --station required')

  const { lookupStation } = require('../server/services/aiStations/catalog')
  const entry = lookupStation(values.genre, values.station)
  if (!entry)
    throw new Error(`Unknown station ${values.genre}/${values.station}`)

  // --dj overrides the catalog default so the lab can audition any DJ on
  // any station.
  const djId = values.dj ? Number(values.dj) : entry.station.djId

  const {
    buildIntroPrompt,
  } = require('../server/services/aiStations/createStationIntro')
  const { djCharacters } = require('../server/services/djCharacters')
  const {
    buildDJSystemPrompt,
  } = require('../server/services/llm/buildDJSystemPrompt')
  const { createChatSession } = require('../server/services/llm')
  const { synthesize } = require('../server/services/tts')

  const persona = await djCharacters(djId)
  if (!persona) throw new Error(`No DJ with id=${djId}`)
  const voiceId = persona.details.voiceID

  const systemInstruction = buildDJSystemPrompt(persona)
  const userPrompt = buildIntroPrompt({
    genreName: entry.genre.name,
    stationName: entry.station.name,
    mode: values.mode,
  })

  section('System prompt', systemInstruction)
  section('User prompt', userPrompt)

  console.log('\n→ Calling Gemini chat (text)…')
  const t0 = Date.now()
  const chat = await createChatSession({
    systemInstruction,
    sessionId: `lab-intro:${djId}:${values.genre}:${values.station}:${Date.now()}`,
  })
  const text = (await chat.sendMessage(userPrompt))?.trim()
  console.log(`  ✓ ${Date.now() - t0}ms`)

  section('Response', text)

  if (values['no-tts']) {
    console.log('\n(--no-tts set; skipping TTS synthesis)')
    return
  }

  console.log('\n→ Calling Gemini TTS…')
  const t1 = Date.now()
  const baseName = `lab_intro_${djId}_${values.genre}_${values.station}_${values.mode}_${Date.now()}`
  const { filePath } = await synthesize({
    text,
    voiceId,
    fileBaseName: baseName,
  })
  console.log(`  ✓ ${Date.now() - t1}ms`)
  console.log(`\nAudio written: ${path.relative(process.cwd(), filePath)}`)
  console.log(
    `URL (dev):    http://127.0.0.1:3000/audio/${path.basename(filePath)}`
  )
}

// ─── tts ───────────────────────────────────────────────────────────────────

async function cmdTts(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      voice: { type: 'string' },
      text: { type: 'string' },
      name: { type: 'string' },
    },
    allowPositionals: false,
  })
  if (!values.voice) throw new Error('--voice <name> required')
  if (!values.text) throw new Error('--text "..." required')

  const { synthesize } = require('../server/services/tts')

  section('Voice', values.voice)
  section('Text', values.text)

  console.log('\n→ Calling Gemini TTS…')
  const t0 = Date.now()
  const baseName = values.name || `lab_tts_${values.voice}_${Date.now()}`
  const { filePath } = await synthesize({
    text: values.text,
    voiceId: values.voice,
    fileBaseName: baseName,
  })
  console.log(`  ✓ ${Date.now() - t0}ms`)
  console.log(`\nAudio written: ${path.relative(process.cwd(), filePath)}`)
  console.log(
    `URL (dev):    http://127.0.0.1:3000/audio/${path.basename(filePath)}`
  )
}

// ─── tracks-prompt ─────────────────────────────────────────────────────────

async function cmdTracksPrompt(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { genre: { type: 'string' }, station: { type: 'string' } },
    allowPositionals: false,
  })
  if (!values.genre || !values.station)
    throw new Error('--genre and --station required')
  const { lookupStation } = require('../server/services/aiStations/catalog')
  const {
    buildStationTracksPrompt,
  } = require('../server/services/aiStations/generateStationTracks')
  const entry = lookupStation(values.genre, values.station)
  if (!entry)
    throw new Error(`Unknown station ${values.genre}/${values.station}`)
  section('Tracks prompt', buildStationTracksPrompt(entry.genre, entry.station))
}

// ─── tracks ────────────────────────────────────────────────────────────────

async function cmdTracks(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { genre: { type: 'string' }, station: { type: 'string' } },
    allowPositionals: false,
  })
  if (!values.genre || !values.station)
    throw new Error('--genre and --station required')

  const { lookupStation } = require('../server/services/aiStations/catalog')
  const {
    buildStationTracksPrompt,
    askGemini,
  } = require('../server/services/aiStations/generateStationTracks')
  const entry = lookupStation(values.genre, values.station)
  if (!entry)
    throw new Error(`Unknown station ${values.genre}/${values.station}`)

  section('Prompt', buildStationTracksPrompt(entry.genre, entry.station))
  console.log('\n→ Calling Gemini (text, JSON mode)…')
  const t0 = Date.now()
  const candidates = await askGemini(entry.genre, entry.station)
  console.log(
    `  ✓ ${Date.now() - t0}ms — got ${candidates.length} candidates`
  )
  console.log(JSON.stringify(candidates, null, 2))
  console.log(
    '\n(Production then resolves each (title, artist) to a Spotify URI;\n' +
      ' the prompt-lab skips that step so you can iterate on the prompt\n' +
      ' without burning Spotify quota.)'
  )
}

// ─── chat ──────────────────────────────────────────────────────────────────

async function cmdChat(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { dj: { type: 'string' }, prompt: { type: 'string' } },
    allowPositionals: false,
  })
  if (!values.dj) throw new Error('--dj <id> required')
  if (!values.prompt) throw new Error('--prompt "..." required')

  const { djCharacters } = require('../server/services/djCharacters')
  const {
    buildDJSystemPrompt,
  } = require('../server/services/llm/buildDJSystemPrompt')
  const { createChatSession } = require('../server/services/llm')

  const persona = await djCharacters(values.dj)
  if (!persona) throw new Error(`No DJ with id=${values.dj}`)
  const systemInstruction = buildDJSystemPrompt(persona)

  section(`DJ #${persona.id} — ${persona.djName}`, '')
  section('User prompt', values.prompt)

  console.log('\n→ Calling Gemini chat…')
  const t0 = Date.now()
  const chat = await createChatSession({
    systemInstruction,
    sessionId: `lab-chat:${persona.id}:${Date.now()}`,
  })
  const out = (await chat.sendMessage(values.prompt))?.trim()
  console.log(`  ✓ ${Date.now() - t0}ms`)
  section('Response', out)
}

main()
