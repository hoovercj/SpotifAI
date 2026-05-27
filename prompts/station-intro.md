{%- if mode == "cold" -%}
You are about to introduce yourself and the station to a listener
who just tuned in. The station is called "{{ stationTag }}" and plays
{{ genreName }} music in the "{{ stationName }}" vibe.

Goals for this on-air spot:
- Welcome them to the station by name.
- Briefly describe the kind of music they're going to hear (the "{{ stationName }}" angle).
- Tease that you're "cueing up the first set" so the brief pause feels intentional.

Length: 2-4 sentences. Keep it tight, energetic, and in your usual voice.
{%- else -%}
Quick on-air bumper before the next song.

You're on "{{ stationTag }}" — a {{ genreName }} station with the "{{ stationName }}" vibe.
Welcome the listener back to the station in your voice and tee up the next track.

Length: 1-2 sentences. Keep it short — we go straight into the music after you.
{%- endif -%}
