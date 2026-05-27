{#-
  Unified DJ intro template for non-station sessions.

  Branches by `seedType`:
    - mood       → activity / mood-based set
    - track      → "more like this song" radio
    - artist     → artist radio
    - playlist   → spinning a user's saved playlist

  Modes:
    - cold = listener just tapped in; the playlist is generating in the
             background. The intro buys ~8-15s and sets the table.
    - warm = playlist is already cued (cache hit or pre-fetched).
             Quick bumper, 1-2 sentences, lead straight into music.

  For "playlist" the playlist name is user-generated and might be
  delightfully weird ("walking the dog at 3am"). Roll with it without
  commenting on the name.
-#}
{%- if seedType == "mood" -%}
  {%- if mode == "cold" -%}
You're about to host a mood-driven set themed around: "{{ name }}".

Goals for this on-air spot:
- Greet the listener warmly and call out the vibe — "{{ name }}".
- Briefly hint at the kind of energy / songs they're about to hear.
- Tease that you're "cueing up the first set" so the brief pause feels intentional.

Length: 2-4 sentences. Keep it tight, energetic, and in your usual voice.
  {%- else -%}
Quick on-air bumper before the next song.

You're hosting the "{{ name }}" set — keep that energy.
Welcome the listener back in your voice and tee up the next track.

Length: 1-2 sentences. Keep it short — we go straight into the music after you.
  {%- endif -%}

{%- elif seedType == "track" -%}
  {%- if mode == "cold" -%}
A listener just tapped "more like this" on a song. The seed track is:
  "{{ name }}" by {{ artistName }}

Goals for this on-air spot:
- Acknowledge the seed track in your own voice (don't quote the title
  back robotically — react to it like a DJ would: "ah, good pick" / "nice
  pull" / "this one always hits", whatever fits your persona).
- Tease the direction the set is going — songs in the same world.
- Briefly tell the listener you're "cueing up the set" so the pause feels intentional.

Length: 2-4 sentences. Conversational, like you're sitting next to them.
  {%- else -%}
Quick on-air bumper for a "more like {{ name }}" set.

Welcome the listener back in your voice and tee up the next track.

Length: 1-2 sentences. Keep it short — we go straight into the music after you.
  {%- endif -%}

{%- elif seedType == "artist" -%}
  {%- if mode == "cold" -%}
A listener just opened a radio station built around an artist:
  {{ artistName }}

Goals for this on-air spot:
- Greet the listener and acknowledge the artist they picked.
- Tease that you've pulled together their tracks + sonically adjacent
  artists ("their world", "their crew", "their lane" — whatever fits
  your voice).
- Briefly tell the listener you're "cueing up the first set" so the
  pause feels intentional.

Length: 2-4 sentences. Tight, energetic, in your usual voice.
  {%- else -%}
Quick on-air bumper for {{ artistName }} radio.

Welcome the listener back in your voice and tee up the next track.

Length: 1-2 sentences. Keep it short — we go straight into the music after you.
  {%- endif -%}

{%- elif seedType == "playlist" -%}
  {%- if mode == "cold" -%}
A listener just kicked off one of their own playlists:
  "{{ name }}"

Goals for this on-air spot:
- Acknowledge the playlist by name (treat it as their pick — don't
  comment on whether the name is good or bad).
- Briefly set the table: "spinning your '{{ name }}' playlist now".
- Stay short — there's nothing to generate in the background, we just
  need a quick welcome before pressing play.

Length: 1-3 sentences. Friendly, brief, then we're straight into the music.
  {%- else -%}
Quick on-air bumper before the next song in the listener's "{{ name }}" playlist.

Welcome the listener back in your voice and tee up the next track.

Length: 1-2 sentences. Keep it short — we go straight into the music after you.
  {%- endif -%}

{%- else -%}
{# Defensive fallback so a typo in seedType doesn't yield an empty prompt. #}
Quick on-air bumper before the next song. Welcome the listener back in your
voice and tee up the next track. Length: 1-2 sentences.
{%- endif -%}
